from __future__ import annotations

import re
import shutil
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "src" / "App.tsx"
OUT_DIR = ROOT / "public" / "reports"
REPORT_DATE = "2026-07-23"
SNAPSHOT_DATE = "2026-07-23"
COMTRADE = "UN Comtrade 2025 / monthly API, HS 2022 (H6)"


def block_after(source: str, marker: str) -> str:
    start = source.index(marker)
    start = source.index("=", start)
    start = source.index("[", start)
    depth = 0
    for index in range(start, len(source)):
        char = source[index]
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return source[start + 1 : index]
    raise ValueError(f"Cannot find block for {marker}")


def object_after(source: str, marker: str) -> str:
    start = source.index(marker)
    start = source.index("{", start)
    depth = 0
    for index in range(start, len(source)):
        char = source[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[start + 1 : index]
    raise ValueError(f"Cannot find object for {marker}")


def split_top_level_entries(block: str) -> list[str]:
    entries: list[str] = []
    depth = 0
    start: int | None = None
    for index, char in enumerate(block):
        if char == "{":
            if depth == 0:
                start = index
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0 and start is not None:
                entries.append(block[start : index + 1])
                start = None
    return entries


def strings_from_array(block: str, field: str) -> list[str]:
    match = re.search(rf"{field}:\s*\[(.*?)\]", block, re.S)
    if not match:
        return []
    return [value.replace('\\"', '"') for value in re.findall(r'"((?:[^"\\]|\\.)*)"', match.group(1))]


def string_field(block: str, field: str, default: str = "") -> str:
    match = re.search(rf"{field}:\s*\"((?:[^\"\\]|\\.)*)\"", block, re.S)
    return match.group(1).replace('\\"', '"') if match else default


def to_hs8(hs: str) -> str:
    return "/".join(part.ljust(8, "0") for part in hs.split("/"))


def stat_level(record: dict) -> str:
    hs = record["hs"]
    if record["id"] == "fertilizer":
        return "统计口径 HS31"
    if "/" in hs:
        return "统计口径 HS6 合并"
    if len(hs) <= 4:
        return "统计口径 HS4"
    return "统计口径 HS6"


def money_billions(value: float) -> str:
    if value >= 1:
        return f"{value:.2f} 十亿美元"
    return f"{value * 1000:.1f} 百万美元"


def parse_records(source: str) -> list[dict]:
    blocks = [
        block_after(source, "const commodities: CommodityRecord[]"),
        block_after(source, "const fertilizerSubitems: CommodityRecord[]"),
        block_after(source, "const tunnelSubitems: CommodityRecord[]"),
        block_after(source, "const earthmovingSubitems: CommodityRecord[]"),
    ]
    records: list[dict] = []
    pattern = re.compile(
        r'\{\s*id:\s*"(?P<id>[^"]+)".*?hs:\s*"(?P<hs>[^"]+)".*?name:\s*"(?P<name>[^"]+)".*?english:\s*"(?P<english>[^"]+)".*?category:\s*"(?P<category>[^"]+)".*?annual\((?P<china>[\d.]+),\s*(?P<world>[\d.]+)\).*?alternatives:\s*\[(?P<alts>[^\]]*)\].*?definition:\s*"(?P<definition>[^"]*)"',
        re.S,
    )
    for block in blocks:
        for entry in split_top_level_entries(block):
            match = pattern.search(entry)
            if not match:
                continue
            record = match.groupdict()
            record["china"] = float(record["china"])
            record["world"] = float(record["world"])
            record["share"] = record["china"] / record["world"] * 100 if record["world"] else 0
            record["alternatives"] = re.findall(r'"([^"]+)"', record.pop("alts"))
            record["hs8"] = to_hs8(record["hs"])
            record["stat_level"] = stat_level(record)
            record["proxy"] = "proxy: true" in entry
            records.append(record)
    return records


def parse_reports(source: str) -> dict[str, dict]:
    reports_block = object_after(source, "const commodityReports")
    reports: dict[str, dict] = {}
    for match in re.finditer(r"\n\s*([a-zA-Z0-9_]+):\s*\{", reports_block):
        report_id = match.group(1)
        start = reports_block.index("{", match.start())
        depth = 0
        end = start
        for index in range(start, len(reports_block)):
            char = reports_block[index]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end = index + 1
                    break
        block = reports_block[start:end]
        reports[report_id] = {
            "title": string_field(block, "title"),
            "evidence": string_field(block, "evidence", "中等"),
            "status": string_field(block, "status", "公开来源审慎判读"),
            "executive": string_field(block, "executive"),
            "data_points": strings_from_array(block, "dataPoints"),
            "analysis": strings_from_array(block, "analysis"),
            "conclusion": string_field(block, "conclusion"),
            "monitoring": strings_from_array(block, "monitoring"),
            "references": strings_from_array(block, "references"),
            "route_boundary": string_field(block, "routeBoundary", "第三国路径仅用于筛查，不构成转口事实认定。"),
        }
    return reports


def parse_accuracy(source: str) -> dict[str, dict]:
    block = object_after(source, "const reportAccuracyById")
    accuracy: dict[str, dict] = {}
    for report_id, level, reason in re.findall(r'([a-zA-Z0-9_]+):\s*\{\s*level:"([^"]+)",\s*reason:"([^"]+)"\s*\}', block):
        accuracy[report_id] = {"level": level, "reason": reason}
    return accuracy


def set_run_font(run, size: float | None = None, bold: bool | None = None, color: str | None = None):
    run.font.name = "Microsoft YaHei"
    run._element.rPr.rFonts.set(qn("w:ascii"), "Microsoft YaHei")
    run._element.rPr.rFonts.set(qn("w:hAnsi"), "Microsoft YaHei")
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color is not None:
        run.font.color.rgb = RGBColor.from_string(color)


def style_document(doc: Document, title: str):
    section = doc.sections[0]
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)
    section.header_distance = Inches(0.492)
    section.footer_distance = Inches(0.492)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Microsoft YaHei"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    normal.font.size = Pt(11)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.1

    for name, size, color, before, after in [
        ("Heading 1", 16, "2E74B5", 16, 8),
        ("Heading 2", 13, "2E74B5", 12, 6),
        ("Heading 3", 12, "1F4D78", 8, 4),
    ]:
        style = styles[name]
        style.font.name = "Microsoft YaHei"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)

    header = section.header.paragraphs[0]
    header.text = "中国-印度供应链依赖图谱"
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    set_run_font(header.runs[0], 9, False, "666666")

    footer = section.footer.paragraphs[0]
    footer.text = f"{title} · {REPORT_DATE}"
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run_font(footer.runs[0], 9, False, "666666")


def add_title(doc: Document, title: str, subtitle: str):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run(title)
    set_run_font(run, 22, True, "000000")
    sub = doc.add_paragraph()
    sub.paragraph_format.space_after = Pt(16)
    run = sub.add_run(subtitle)
    set_run_font(run, 11, False, "555555")


def shade_cell(cell, fill: str):
    tc_pr = cell._tc.get_or_add_tcPr()
    shading = OxmlElement("w:shd")
    shading.set(qn("w:fill"), fill)
    tc_pr.append(shading)


def set_cell_text(cell, text: str, bold: bool = False, color: str = "000000"):
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    paragraph = cell.paragraphs[0]
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.text = ""
    run = paragraph.add_run(text)
    set_run_font(run, 9.5, bold, color)


def add_metadata_table(doc: Document, rows: list[tuple[str, str]]):
    table = doc.add_table(rows=len(rows), cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.style = "Table Grid"
    table.autofit = False
    for row_index, (label, value) in enumerate(rows):
        cells = table.rows[row_index].cells
        cells[0].width = Inches(1.6)
        cells[1].width = Inches(4.8)
        shade_cell(cells[0], "F2F4F7")
        set_cell_text(cells[0], label, True, "1F4D78")
        set_cell_text(cells[1], value)
    doc.add_paragraph()


def add_bullets(doc: Document, values: list[str]):
    for value in values:
        paragraph = doc.add_paragraph(style="List Bullet")
        paragraph.paragraph_format.space_after = Pt(4)
        run = paragraph.add_run(value)
        set_run_font(run, 10.5)


def commodity_report_doc(record: dict, report: dict, accuracy: dict) -> Document:
    title = report.get("title") or f"{record['name']}供应链依赖分析报告"
    doc = Document()
    style_document(doc, title)
    add_title(doc, title, f"商品：{record['name']} / {record['english']} · 快照 {SNAPSHOT_DATE}")
    add_metadata_table(
        doc,
        [
            ("HS2022 8位码", record["hs8"]),
            ("统计口径", record["stat_level"]),
            ("2025 自中国进口", money_billions(record["china"])),
            ("2025 全球进口", money_billions(record["world"])),
            ("对华来源占比", f"{record['share']:.1f}%"),
            ("结论准确度", f"{accuracy.get('level', '高概率')}：{accuracy.get('reason', '结论基于公开统计与审慎边界。')}"),
        ],
    )

    doc.add_heading("一、核心判断", level=1)
    doc.add_paragraph(report.get("executive") or f"{record['name']}在 2025 年的对华来源占比为 {record['share']:.1f}%，应结合企业采购、原产地证书和 HS8 单证继续验证。")

    doc.add_heading("二、数据事实", level=1)
    data_points = report.get("data_points") or [
        f"2025 年印度自中国进口 {money_billions(record['china'])}，全球进口 {money_billions(record['world'])}，对华来源占比 {record['share']:.1f}%。",
        f"页面展示的 HS2022 8 位码为 {record['hs8']}；公开统计金额仍采用 {record['stat_level']}。",
        f"主要替代供应国或地区包括：{'、'.join(record['alternatives'])}。",
    ]
    add_bullets(doc, data_points)

    doc.add_heading("三、分析", level=1)
    analysis = report.get("analysis") or [
        "该品类的公开贸易数据能够用于识别来源集中度，但不足以替代企业级 BOM、合同、发票、原产地证书和物流单证。",
        "对第三国路径的判断应区分实质加工、区域分销、库存调拨和简单转运；金额同步变化只能作为筛查信号。",
    ]
    for paragraph in analysis:
        doc.add_paragraph(paragraph)

    doc.add_heading("四、第三国路径与判读边界", level=1)
    doc.add_paragraph(report.get("route_boundary") or "当前公开数据仅能提供路径筛查信号，不构成转口事实认定。")

    doc.add_heading("五、结论", level=1)
    doc.add_paragraph(report.get("conclusion") or f"{record['name']}应作为供应链依赖监测对象，结论准确度为 {accuracy.get('level', '高概率')}。后续需用 HS8 与业务单证校验。")

    doc.add_heading("六、后续监测重点", level=1)
    monitoring = report.get("monitoring") or ["HS8 单证与企业采购数据", "原产国、装运国与发票国差异", "月度进口额和对华占比异常波动"]
    add_bullets(doc, monitoring)

    doc.add_heading("七、来源", level=1)
    references = report.get("references") or [COMTRADE, "印度 DGCI&S TradeStat", "项目页面公开研究口径说明"]
    add_bullets(doc, references)
    doc.add_paragraph("注：本报告用于公开来源研究和合规初筛，不构成法律意见或个案事实认定。")
    return doc


def overall_report_doc(records: list[dict]) -> Document:
    doc = Document()
    style_document(doc, "总分析报告")
    add_title(doc, "中国-印度供应链依赖图谱总分析报告", f"重点商品矩阵、化肥专题、工程设备专题与报告下载索引 · 快照 {SNAPSHOT_DATE}")
    china_total = sum(record["china"] for record in records if len(record["id"].split("_")) == 1)
    world_total = sum(record["world"] for record in records if len(record["id"].split("_")) == 1)
    add_metadata_table(
        doc,
        [
            ("报告范围", "重点商品矩阵及可交互子项"),
            ("分类版本", "HS 2022；页面展示 8 位筛查码"),
            ("统计边界", "金额按 UN Comtrade 可复核的 HS31、HS4、HS6 单项或合并口径计算"),
            ("加权对华来源占比", f"{china_total / world_total * 100:.1f}%"),
            ("研究日期", REPORT_DATE),
        ],
    )
    doc.add_heading("一、总览结论", level=1)
    doc.add_paragraph("样本显示，印度对中国的进口来源依赖集中在蓄电池、含氮/含氧化工品、半导体器件、电力设备、工程机械零部件及部分工程车辆。8 位编码用于后续业务单证对齐，公开统计金额仍应按来源可复核层级阅读。")
    doc.add_paragraph("第三国路径应作为筛查信号而非事实认定。报告中的多节点路径允许出现两至三个中转经济体，但只有在金额、时间、产品、原产地和物流单证闭合后，才能进入个案判断。")

    doc.add_heading("二、重点商品表", level=1)
    table = doc.add_table(rows=1, cols=6)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    headers = ["商品", "HS8", "统计口径", "自中国进口", "全球进口", "对华占比"]
    for index, header in enumerate(headers):
        shade_cell(table.rows[0].cells[index], "F2F4F7")
        set_cell_text(table.rows[0].cells[index], header, True, "1F4D78")
    for record in sorted(records, key=lambda item: item["share"], reverse=True):
        row = table.add_row().cells
        values = [
            record["name"],
            record["hs8"],
            record["stat_level"],
            money_billions(record["china"]),
            money_billions(record["world"]),
            f"{record['share']:.1f}%",
        ]
        for index, value in enumerate(values):
            set_cell_text(row[index], value)

    doc.add_heading("三、化肥专题", level=1)
    doc.add_paragraph("化肥应按总项和子项分开。HS31 总项用于观察整体暴露；尿素、DAP、MOP、NPK 分别对应不同采购周期、替代来源和政策敏感性，财年数量与自然年价值不可直接混算。")
    doc.add_heading("四、工程设备专题", level=1)
    doc.add_paragraph("盾构机、工程车和工程机械零部件均已进入重点商品矩阵。盾构机税号为筛查池，工程车按非公路用自卸车、汽车起重机和混凝土搅拌车拆分；镜像贸易差异是审计触发器，不是转口证明。")
    doc.add_heading("五、方法与限制", level=1)
    add_bullets(
        doc,
        [
            "依赖率 = 印度自中国进口额 ÷ 印度全球进口额。",
            "8 位码用于业务数据验证；公开统计层级不足时，仍标注 HS31、HS4 或 HS6 合并口径。",
            "结论准确度分为高概率、低概率、推测，表示公开证据强弱，不代表法律结论。",
            "本报告不对违法转口、规避关税或规避出口管制作事实认定。",
        ],
    )
    return doc


def main():
    source = APP.read_text(encoding="utf-8")
    records = parse_records(source)
    reports = parse_reports(source)
    accuracy = parse_accuracy(source)
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    overall = overall_report_doc(records)
    overall.save(OUT_DIR / "overall.docx")

    for record in records:
        doc = commodity_report_doc(record, reports.get(record["id"], {}), accuracy.get(record["id"], {}))
        doc.save(OUT_DIR / f"{record['id']}.docx")

    print(f"Generated {len(records) + 1} Word reports in {OUT_DIR}")


if __name__ == "__main__":
    main()
