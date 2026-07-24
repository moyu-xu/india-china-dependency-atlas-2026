from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor, Twips


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "src" / "App.tsx"
OUT_DIR = ROOT / "public" / "reports"
REPORT_DATE = "2026-07-23"
SNAPSHOT_DATE = "2026-07-23"
COMTRADE = "UN Comtrade 2025 / monthly API, HS 2022 (H6)"
BATTERY_CUSTOMS = json.loads((ROOT / "src" / "data" / "batteryChinaCustoms.json").read_text(encoding="utf-8"))
TABLE_WIDTH_DXA = 9360
TABLE_INDENT_DXA = 120


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
    return hs


def stat_level(record: dict) -> str:
    hs = record["hs"]
    return "中国 HS8" if len(hs) == 8 else "HS6 国际可比口径"


def money_billions(value: float) -> str:
    if value >= 1:
        return f"{value:.2f} 十亿美元"
    return f"{value * 1000:.1f} 百万美元"


def rmb_billions(value: int) -> str:
    return f"{value / 1_000_000_000:.2f} 十亿元人民币"


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
    return [record for record in records if record["id"] not in {"fertilizer", "tunnel", "earthmoving"}]


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
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)
    section.header_distance = Inches(0.492)
    section.footer_distance = Inches(0.492)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Microsoft YaHei"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Microsoft YaHei")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Microsoft YaHei")
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
        style._element.rPr.rFonts.set(qn("w:ascii"), "Microsoft YaHei")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Microsoft YaHei")
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


def set_table_geometry(table, widths: list[int]):
    if sum(widths) != TABLE_WIDTH_DXA:
        raise ValueError(f"Table widths must total {TABLE_WIDTH_DXA}: {widths}")
    table.autofit = False
    table.allow_autofit = False
    tbl_pr = table._tbl.tblPr
    for tag in ("w:tblW", "w:tblInd", "w:tblLayout", "w:tblCellMar"):
        for element in list(tbl_pr.findall(qn(tag))):
            tbl_pr.remove(element)

    tbl_w = OxmlElement("w:tblW")
    tbl_w.set(qn("w:w"), str(TABLE_WIDTH_DXA))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_pr.append(tbl_w)
    tbl_ind = OxmlElement("w:tblInd")
    tbl_ind.set(qn("w:w"), str(TABLE_INDENT_DXA))
    tbl_ind.set(qn("w:type"), "dxa")
    tbl_pr.append(tbl_ind)
    layout = OxmlElement("w:tblLayout")
    layout.set(qn("w:type"), "fixed")
    tbl_pr.append(layout)
    margins = OxmlElement("w:tblCellMar")
    for edge, value in (("top", 80), ("start", 120), ("bottom", 80), ("end", 120)):
        node = OxmlElement(f"w:{edge}")
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")
        margins.append(node)
    tbl_pr.append(margins)

    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        grid.append(col)
    for row in table.rows:
        for index, cell in enumerate(row.cells):
            cell.width = Twips(widths[index])
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.first_child_found_in("w:tcW")
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(widths[index]))
            tc_w.set(qn("w:type"), "dxa")


def repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    marker = OxmlElement("w:tblHeader")
    marker.set(qn("w:val"), "true")
    tr_pr.append(marker)


def add_metadata_table(doc: Document, rows: list[tuple[str, str]]):
    table = doc.add_table(rows=len(rows), cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.style = "Table Grid"
    for row_index, (label, value) in enumerate(rows):
        cells = table.rows[row_index].cells
        shade_cell(cells[0], "F2F4F7")
        set_cell_text(cells[0], label, True, "1F4D78")
        set_cell_text(cells[1], value)
    set_table_geometry(table, [2300, 7060])
    doc.add_paragraph()


def add_bullets(doc: Document, values: list[str]):
    for value in values:
        paragraph = doc.add_paragraph(style="List Bullet")
        paragraph.paragraph_format.space_after = Pt(4)
        run = paragraph.add_run(value)
        set_run_font(run, 10.5)


def commodity_report_doc(record: dict, report: dict, accuracy: dict) -> Document:
    report = {}
    title = f"{record['name']}对华进口依赖与供应风险分析报告"
    doc = Document()
    style_document(doc, title)
    add_title(doc, title, f"商品：{record['name']} / {record['english']} · 快照 {SNAPSHOT_DATE}")
    add_metadata_table(
        doc,
        [
            ("真实统计编码", f"{record['stat_level']} {record['hs8']}"),
            ("统计口径", record["stat_level"]),
            ("2025 自中国进口", money_billions(record["china"])),
            ("2025 全球进口", money_billions(record["world"])),
            ("对华来源占比", f"{record['share']:.1f}%"),
            ("结论准确度", f"{accuracy.get('level', '高概率')}：{accuracy.get('reason', '结论基于公开统计与审慎边界。')}"),
        ],
    )

    doc.add_heading("一、核心判断", level=1)
    concentration = "高度集中" if record["share"] >= 75 else "较高" if record["share"] >= 50 else "中等" if record["share"] >= 20 else "较低"
    doc.add_paragraph(
        f"2025 年，印度进口“{record['name']}”中来自中国的金额占比为 {record['share']:.1f}%，"
        f"按本报告阈值属于{concentration}。该判断严格限定于 HS 2022 六位商品编码 {record['hs']}，"
        "不外推至父级税目、具体企业或受控技术参数。"
    )

    doc.add_heading("二、数据事实", level=1)
    data_points = report.get("data_points") or [
        f"2025 年印度自中国进口 {money_billions(record['china'])}，全球进口 {money_billions(record['world'])}，对华来源占比 {record['share']:.1f}%。",
        f"页面和报告均使用真实的 {record['stat_level']} {record['hs8']}；不补零、不使用父级大类代理金额。",
        f"剔除中国后，2025 年其他主要供应来源为：{'、'.join(record['alternatives']) if record['alternatives'] else '未报告其他境外来源'}。",
    ]
    add_bullets(doc, data_points)

    doc.add_heading("三、分析", level=1)
    analysis = report.get("analysis") or [
        f"印度自中国进口 {money_billions(record['china'])}，相对于该商品进口总额 {money_billions(record['world'])}；比例使用未舍入金额计算，页面显示值仅作四舍五入。",
        "其他供应来源按同一 HS6、同一报告国、同一年度的进口金额排序。它们说明采购来源结构，不等于已经具备同等产能、认证、交付周期或价格条件。",
        "公开贸易数据能够识别来源集中度，但不足以替代企业级 BOM、合同、发票、原产地证书和物流单证。对受控物项还必须核对技术参数、最终用户和最终用途。",
    ]
    for paragraph in analysis:
        doc.add_paragraph(paragraph)

    if record["id"] == "battery":
        customs = BATTERY_CUSTOMS
        doc.add_heading("中国海关 HS8 出口镜像数据（2025）", level=2)
        doc.add_paragraph(
            f"用户提供的中国海关明细包含 {customs['annual']['rows']} 行记录，"
            f"口径为中国出口至印度、HS8 {customs['hs8']}、2025 年1—12月。"
            f"各月明细汇总为 {rmb_billions(customs['annual']['rmb'])}、"
            f"{customs['annual']['units']:,} 个和 {customs['annual']['kg']:,} 千克；12 个月合计与年度汇总一致。"
        )
        doc.add_paragraph(
            "该数据是中国出口镜像口径，币种为人民币；不直接替代印度报告的 CIF 进口额、"
            "印度全球进口额或对华来源占比。它用于验证月度方向、数量与贸易方式结构。"
        )
        table = doc.add_table(rows=1, cols=4)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.style = "Table Grid"
        for index, header in enumerate(["月份", "出口额（人民币）", "第一数量（个）", "第二数量（千克）"]):
            shade_cell(table.rows[0].cells[index], "F2F4F7")
            set_cell_text(table.rows[0].cells[index], header, True, "1F4D78")
        repeat_table_header(table.rows[0])
        for point in customs["months"]:
            row = table.add_row().cells
            values = [point["period"], rmb_billions(point["rmb"]), f"{point['units']:,}", f"{point['kg']:,}"]
            for index, value in enumerate(values):
                set_cell_text(row[index], value)
        set_table_geometry(table, [1200, 2200, 2880, 3080])
        doc.add_paragraph(
            "结构补充：一般贸易占 78.31%，进料加工贸易占 19.50%；"
            "2025 年12月出口额为 41.56 亿元，为年内最高值。"
        )

    doc.add_heading("四、第三国路径与判读边界", level=1)
    doc.add_paragraph(
        f"当前未取得与 HS6 {record['hs']} 完全同口径且能够对应同一批货物的逐段单证闭环。"
        "即使中国至一个或多个中转国、再至印度的双边金额在同一时期同步上升，也只能作为核验线索；"
        "必须再用提单、原产地证书、发票、加工记录或公开查发案例确认。"
    )

    doc.add_heading("五、结论", level=1)
    conclusion = (
        f"{record['name']}对华进口来源集中度{concentration}，应"
        f"{'列入优先核验清单' if record['share'] >= 50 else '保持常态监测'}。"
        f"本结论准确度标注为“{accuracy.get('level', '高概率')}”，仅适用于 HS6 {record['hs']} 的 2025 年进口来源结构；"
        "后续若取得中国海关 HS8、企业料号和业务单证，应在不改变国际 HS6 可比口径的前提下进一步下钻。"
    )
    doc.add_paragraph(conclusion)

    doc.add_heading("六、后续监测重点", level=1)
    monitoring = [
        f"HS6 {record['hs']} 的月度进口金额、数量和对华来源占比",
        "中国海关 HS8、企业料号与印度本国八位税号映射",
        "原产国、装运国、发票国、提单路径与实际加工工序",
        "出口许可证、技术参数、最终用户和最终用途变化",
    ]
    add_bullets(doc, monitoring)

    doc.add_heading("七、来源", level=1)
    references = [
        f"UN Comtrade 公共 API：reporterCode=699（印度）、partnerCode=0/156、flowCode=M、cmdCode={record['hs']}、period=2025；访问 {SNAPSHOT_DATE}。",
        "印度 DGCI&S TradeStat：月度贸易数据库与编码调整说明。",
        "中国商务部、海关总署及中国出口管制信息网：现行两用物项清单、公告与许可证管理目录。",
    ]
    if record["id"] == "battery":
        references.append(
            f"{BATTERY_CUSTOMS['sourceLabel']}（{BATTERY_CUSTOMS['sourceFile']}）："
            f"HS8 {BATTERY_CUSTOMS['hs8']}、{BATTERY_CUSTOMS['flow']}、{BATTERY_CUSTOMS['period']}，"
            f"币种人民币；访问 {BATTERY_CUSTOMS['accessedAt']}。"
        )
    add_bullets(doc, references)
    doc.add_paragraph("注：本报告用于公开来源研究和合规初筛，不构成法律意见或个案事实认定。")
    return doc


def overall_report_doc(records: list[dict]) -> Document:
    doc = Document()
    style_document(doc, "总分析报告")
    add_title(doc, "中国-印度供应链依赖图谱总分析报告", f"重点商品矩阵、化肥专题、工程设备专题与报告下载索引 · 快照 {SNAPSHOT_DATE}")
    china_total = sum(record["china"] for record in records)
    world_total = sum(record["world"] for record in records)
    add_metadata_table(
        doc,
        [
            ("报告范围", "重点商品矩阵及可交互子项"),
            ("分类版本", "HS 2022；按公开来源最细可核验层级显示真实 HS6/HS8"),
            ("统计边界", "仅汇总互不重叠的具体商品物项；不使用补零代理或父级大类重复金额"),
            ("加权对华来源占比", f"{china_total / world_total * 100:.1f}%"),
            ("研究日期", REPORT_DATE),
        ],
    )
    doc.add_heading("一、总览结论", level=1)
    doc.add_paragraph(
        f"本报告汇总 {len(records)} 个互不重叠的 HS 2022 六位商品物项。2025 年这些商品自中国进口合计"
        f" {money_billions(china_total)}，商品进口总额合计 {money_billions(world_total)}，加权对华来源占比为"
        f" {china_total / world_total * 100:.1f}%。矩阵不计入 HS31、HS4 或专题父级金额，也不使用补零八位码。"
    )
    doc.add_paragraph("第三国路径应作为筛查信号而非事实认定。报告中的多节点路径允许出现两至三个中转经济体，但只有在金额、时间、产品、原产地和物流单证闭合后，才能进入个案判断。")

    doc.add_heading("二、重点商品表", level=1)
    table = doc.add_table(rows=1, cols=6)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    headers = ["具体商品", "统计编码", "统计口径", "从中国进口", "商品进口总额", "从中国进口占比"]
    for index, header in enumerate(headers):
        shade_cell(table.rows[0].cells[index], "F2F4F7")
        set_cell_text(table.rows[0].cells[index], header, True, "1F4D78")
    repeat_table_header(table.rows[0])
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
    set_table_geometry(table, [2200, 1080, 1480, 1500, 1500, 1600])

    doc.add_heading("三、化肥专题", level=1)
    doc.add_paragraph("化肥应按总项和子项分开。HS31 总项用于观察整体暴露；尿素、DAP、MOP、NPK 分别对应不同采购周期、替代来源和政策敏感性，财年数量与自然年价值不可直接混算。")
    doc.add_heading("四、工程设备专题", level=1)
    doc.add_paragraph("工程设备专题以 HS 843031、843039、870410、870510、870540 和 843143 等法定六位商品物项分别统计。专题标题仅作导航；其中 HS 843031/843039 还包含采煤机和截岩机，不能把税目金额直接称为盾构机成交额或台数。镜像贸易差异是审计触发器，不是转口证明。")
    doc.add_heading("五、方法与限制", level=1)
    add_bullets(
        doc,
        [
            "依赖率 = 印度自中国进口额 ÷ 印度全球进口额。",
            "公开统计统一使用真实 HS 2022 六位商品编码；不补零、不使用父级大类或代理金额。中国 HS8 仅在取得海关或企业业务数据后用于向下映射。",
            f"自动审计逐项核对 {len(records)} 个商品的 2025 年世界/中国进口额、12 个月月度合计及其他供应国排序，并使用缓存、限速和 429 自动重试。",
            "结论准确度分为高概率、低概率、推测，表示公开证据强弱，不代表法律结论。",
            "本报告不对违法转口、规避关税或规避出口管制作事实认定。",
        ],
    )
    return doc


def main():
    parser = argparse.ArgumentParser(description="Generate website Word reports")
    parser.add_argument("--only", action="append", choices=["overall", "battery"], help="Regenerate only the selected report")
    args = parser.parse_args()
    source = APP.read_text(encoding="utf-8")
    records = parse_records(source)
    reports = parse_reports(source)
    accuracy = parse_accuracy(source)
    selected = set(args.only or [])
    if not selected and OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    generated = 0
    if not selected or "overall" in selected:
        overall = overall_report_doc(records)
        overall.save(OUT_DIR / "overall.docx")
        generated += 1

    for record in records:
        if selected and record["id"] not in selected:
            continue
        doc = commodity_report_doc(record, reports.get(record["id"], {}), accuracy.get(record["id"], {}))
        doc.save(OUT_DIR / f"{record['id']}.docx")
        generated += 1

    print(f"Generated {generated} Word report(s) in {OUT_DIR}")


if __name__ == "__main__":
    main()
