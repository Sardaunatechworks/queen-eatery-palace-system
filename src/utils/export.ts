import { jsPDF } from "jspdf";
import autoTable, { applyPlugin } from "jspdf-autotable";
import * as XLSX from "xlsx";
import { format } from "date-fns";

// Register autoTable plugin with jsPDF if needed
try {
  if (typeof applyPlugin === "function") {
    applyPlugin(jsPDF);
  }
} catch {
  // ignore
}

/**
 * Safely executes autoTable across all ES module / bundling environments.
 */
function runAutoTable(doc: any, options: any): void {
  if (typeof autoTable === "function") {
    autoTable(doc, options);
  } else if (typeof doc.autoTable === "function") {
    doc.autoTable(options);
  } else if (typeof (autoTable as any)?.default === "function") {
    (autoTable as any).default(doc, options);
  } else {
    throw new Error("PDF table generator plugin (autoTable) is not initialized.");
  }
}

export const exportToCSV = (data: any[], filename: string) => {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]).join(",");
  const rows = data.map((row) =>
    Object.values(row)
      .map((val) => `"${String(val ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  const csvContent = "\uFEFF" + [headers, ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${format(new Date(), "yyyyMMdd")}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportToExcel = (data: any[], filename: string) => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
  XLSX.writeFile(workbook, `${filename}_${format(new Date(), "yyyyMMdd")}.xlsx`);
};

export const exportToPDF = (headers: string[], data: any[][], title: string) => {
  const doc = new jsPDF();

  // Custom styles for "Royal" look
  doc.setFontSize(22);
  doc.setTextColor(200, 30, 30); // Royal Red
  doc.text(title, 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated on: ${format(new Date(), "dd MMM yyyy, h:mm a")}`, 14, 30);

  runAutoTable(doc, {
    head: [headers],
    body: data,
    startY: 40,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [200, 30, 30], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    margin: { top: 40 },
  });

  doc.save(`${title.toLowerCase().replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd")}.pdf`);
};

// ============================================
// Specialized Menu Catalog Exports
// ============================================

export interface MenuExportOptions {
  scopeName?: string;
  categoryFilterName?: string;
}

interface MenuCategorySection {
  title: string;
  items: { name: string; price: string }[];
  height: number;
}

// Preferred visual priority ordering for restaurant categories
const PREFERRED_CATEGORY_ORDER = [
  "african dishes",
  "rice dishes",
  "rice",
  "swallow & soups",
  "swallow",
  "soups",
  "meals",
  "pasta, noodles & light meals",
  "pasta",
  "noodles",
  "fast food",
  "snacks",
  "burgers, pizza & fries",
  "burgers",
  "pizza",
  "barbecue, grills & protein",
  "grills",
  "barbecue",
  "intercontinental & signature dishes",
  "intercontinental",
  "drinks & desserts",
  "drinks",
  "beverages",
  "desserts & sweets",
  "desserts",
];

const getCategoryRank = (name: string): number => {
  const lower = name.toLowerCase().trim();
  for (let i = 0; i < PREFERRED_CATEGORY_ORDER.length; i++) {
    if (lower === PREFERRED_CATEGORY_ORDER[i] || lower.includes(PREFERRED_CATEGORY_ORDER[i])) {
      return i;
    }
  }
  return 999;
};

const formatPriceDisplay = (priceVal: any): string => {
  if (priceVal === null || priceVal === undefined) return "0";
  if (typeof priceVal === "number") {
    return Number(priceVal).toLocaleString("en-US");
  }
  const str = String(priceVal).trim();
  if (str.includes("–") || str.includes("-")) {
    return str;
  }
  const num = parseFloat(str.replace(/[^0-9.]/g, ""));
  if (isNaN(num)) return str;
  return Number(num).toLocaleString("en-US");
};

/**
 * Exports the restaurant menu into the official Queen's Palace Full Menu format
 * with 2-column layout, deep maroon ribbons, elegant dotted leaders, vector Naira symbols,
 * and official contact footer, using exclusively the dynamic menu items from the database.
 */
export const exportMenuToPDF = (items: any[], options?: MenuExportOptions) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const PAGE_WIDTH = 210;
  const PAGE_HEIGHT = 297;
  const MARGIN_LEFT = 12;
  const MARGIN_RIGHT = 12;
  const MARGIN_TOP_P1 = 36;
  const MARGIN_TOP_P2 = 14;
  const MARGIN_BOTTOM = 22;
  const MAX_CONTENT_Y = PAGE_HEIGHT - MARGIN_BOTTOM;

  const COL_GAP = 8;
  const USABLE_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
  const COL_WIDTH = (USABLE_WIDTH - COL_GAP) / 2;
  const COL_X = [MARGIN_LEFT, MARGIN_LEFT + COL_WIDTH + COL_GAP];
  const COL_RIGHT = [MARGIN_LEFT + COL_WIDTH, MARGIN_LEFT + COL_WIDTH + COL_GAP + COL_WIDTH];

  // Queen's Palace Royal Brand Palette
  const COLOR_BANNER = [50, 14, 18];       // #320E12 Top Header Deep Burgundy
  const COLOR_RIBBON = [75, 18, 26];       // #4B121A Category Ribbon Wine/Maroon
  const COLOR_GOLD = [223, 177, 91];       // #DFB15B Warm Regal Gold
  const COLOR_WHITE = [255, 255, 255];
  const COLOR_TEXT_DARK = [18, 18, 18];    // #121212
  const COLOR_FOOTER_LINE = [212, 175, 87];// #D4AF57
  const COLOR_DOTS = [135, 135, 135];      // Dotted Leader

  let currentPage = 1;
  let currentCol = 0; // 0 = Left Column, 1 = Right Column
  let currentY = MARGIN_TOP_P1;

  // Header Banner on Page 1
  function drawHeaderBanner() {
    const bannerY = 10;
    const bannerH = 21.5;
    doc.setFillColor(COLOR_BANNER[0], COLOR_BANNER[1], COLOR_BANNER[2]);
    doc.rect(MARGIN_LEFT, bannerY, USABLE_WIDTH, bannerH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(17.5);
    doc.setTextColor(COLOR_GOLD[0], COLOR_GOLD[1], COLOR_GOLD[2]);
    doc.text("THE QUEEN’S PALACE", PAGE_WIDTH / 2, bannerY + 7.5, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(COLOR_WHITE[0], COLOR_WHITE[1], COLOR_WHITE[2]);
    doc.text("EATERY AND EVENT HALL", PAGE_WIDTH / 2, bannerY + 13, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(COLOR_GOLD[0], COLOR_GOLD[1], COLOR_GOLD[2]);

    const isFiltered =
      options?.categoryFilterName &&
      options.categoryFilterName.toLowerCase() !== "all" &&
      options.categoryFilterName.toLowerCase() !== "all categories";
    const subTitleText = isFiltered
      ? `— ${options!.categoryFilterName!.toUpperCase()} —`
      : "— FULL MENU —";
    doc.text(subTitleText, PAGE_WIDTH / 2, bannerY + 18, { align: "center" });
  }

  // Footer on Every Page
  function drawFooter() {
    const lineY = PAGE_HEIGHT - 17;
    doc.setDrawColor(COLOR_FOOTER_LINE[0], COLOR_FOOTER_LINE[1], COLOR_FOOTER_LINE[2]);
    doc.setLineWidth(0.4);
    const ruleX1 = PAGE_WIDTH / 2 - 70;
    const ruleX2 = PAGE_WIDTH / 2 + 70;
    doc.line(ruleX1, lineY, ruleX2, lineY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(COLOR_TEXT_DARK[0], COLOR_TEXT_DARK[1], COLOR_TEXT_DARK[2]);
    doc.text(
      "Prices are inclusive of applicable taxes  •  Please inform staff of any allergies",
      PAGE_WIDTH / 2,
      lineY + 4,
      { align: "center" }
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(COLOR_TEXT_DARK[0], COLOR_TEXT_DARK[1], COLOR_TEXT_DARK[2]);
    doc.text("For WhatsApp Orders & Reservations: +234 813 554 9195", PAGE_WIDTH / 2, lineY + 8, {
      align: "center",
    });
  }

  function advanceColumn() {
    if (currentCol === 0) {
      currentCol = 1;
      currentY = currentPage === 1 ? MARGIN_TOP_P1 : MARGIN_TOP_P2;
    } else {
      drawFooter();
      doc.addPage();
      currentPage++;
      currentCol = 0;
      currentY = MARGIN_TOP_P2;
    }
  }

  function ensureSpace(heightNeeded: number) {
    if (currentY + heightNeeded > MAX_CONTENT_Y) {
      advanceColumn();
    }
  }

  function drawCategoryRibbon(title: string) {
    ensureSpace(14); // Ribbon + spacing + at least one item
    const ribbonH = 6.2;
    const x = COL_X[currentCol];

    doc.setFillColor(COLOR_RIBBON[0], COLOR_RIBBON[1], COLOR_RIBBON[2]);
    doc.rect(x, currentY, COL_WIDTH, ribbonH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(COLOR_WHITE[0], COLOR_WHITE[1], COLOR_WHITE[2]);
    doc.text(title.toUpperCase(), x + COL_WIDTH / 2, currentY + 4.4, { align: "center" });

    currentY += ribbonH + 3.2;
  }

  function drawCrossbars(x: number, y: number, nW: number) {
    const capH = 1.85;
    doc.setLineWidth(0.18);
    doc.setDrawColor(COLOR_TEXT_DARK[0], COLOR_TEXT_DARK[1], COLOR_TEXT_DARK[2]);
    doc.line(x - 0.15, y - capH * 0.42, x + nW + 0.15, y - capH * 0.42);
    doc.line(x - 0.15, y - capH * 0.62, x + nW + 0.15, y - capH * 0.62);
  }

  function drawNairaPrice(priceStr: string, rightX: number, y: number): number {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(COLOR_TEXT_DARK[0], COLOR_TEXT_DARK[1], COLOR_TEXT_DARK[2]);

    if (priceStr.includes("–") || priceStr.includes("-")) {
      const parts = priceStr.split(/[–-]/).map((p) => p.trim());
      const p1 = parts[0].replace(/[^0-9,]/g, "");
      const p2 = parts[1].replace(/[^0-9,]/g, "");

      const dashW = doc.getTextWidth(" – ");
      const p2NumW = doc.getTextWidth(p2);
      const nW = doc.getTextWidth("N");
      const p1NumW = doc.getTextWidth(p1);
      const totalW = nW + p1NumW + dashW + nW + p2NumW;

      let currX = rightX - totalW;

      doc.text("N", currX, y);
      drawCrossbars(currX, y, nW);
      currX += nW;
      doc.text(p1, currX, y);
      currX += p1NumW;
      doc.text(" – ", currX, y);
      currX += dashW;
      doc.text("N", currX, y);
      drawCrossbars(currX, y, nW);
      currX += nW;
      doc.text(p2, currX, y);
      return totalW;
    } else {
      const cleanNum = priceStr.replace(/[^0-9,]/g, "");
      const numW = doc.getTextWidth(cleanNum);
      const nW = doc.getTextWidth("N");
      const totalW = nW + numW;
      const nX = rightX - totalW;

      doc.text("N", nX, y);
      drawCrossbars(nX, y, nW);
      doc.text(cleanNum, nX + nW, y);
      return totalW;
    }
  }

  function drawMenuItem(name: string, priceVal: string | number) {
    ensureSpace(4.6);
    const x = COL_X[currentCol];
    const rightX = COL_RIGHT[currentCol];
    const rowY = currentY + 3.2;

    const priceStr = formatPriceDisplay(priceVal);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);

    let priceW = 0;
    if (priceStr.includes("–") || priceStr.includes("-")) {
      const parts = priceStr.split(/[–-]/).map((p) => p.trim());
      const p1 = parts[0].replace(/[^0-9,]/g, "");
      const p2 = parts[1].replace(/[^0-9,]/g, "");
      priceW =
        doc.getTextWidth("N") * 2 +
        doc.getTextWidth(p1) +
        doc.getTextWidth(" – ") +
        doc.getTextWidth(p2);
    } else {
      const cleanNum = priceStr.replace(/[^0-9,]/g, "");
      priceW = doc.getTextWidth("N") + doc.getTextWidth(cleanNum);
    }

    drawNairaPrice(priceStr, rightX, rowY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(COLOR_TEXT_DARK[0], COLOR_TEXT_DARK[1], COLOR_TEXT_DARK[2]);

    const maxNameW = COL_WIDTH - priceW - 6;
    let displayName = name;
    if (doc.getTextWidth(displayName) > maxNameW) {
      while (displayName.length > 3 && doc.getTextWidth(displayName + "…") > maxNameW) {
        displayName = displayName.slice(0, -1);
      }
      displayName += "…";
    }
    doc.text(displayName, x, rowY);
    const nameW = doc.getTextWidth(displayName);

    const dotsStartX = x + nameW + 1.2;
    const dotsEndX = rightX - priceW - 1.2;
    const availW = dotsEndX - dotsStartX;

    if (availW > 2) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(COLOR_DOTS[0], COLOR_DOTS[1], COLOR_DOTS[2]);
      const dotUnit = " .";
      const dotW = doc.getTextWidth(dotUnit);
      const count = Math.floor(availW / dotW);
      if (count > 0) {
        const dotsStr = dotUnit.repeat(count);
        const actualW = doc.getTextWidth(dotsStr);
        doc.text(dotsStr, dotsEndX - actualW, rowY);
      }
    }

    currentY += 4.5;
  }

  // Group strictly from database / passed items (no hardcoded sample dishes)
  const categoryMap = new Map<string, { name: string; price: string }[]>();

  (items || []).forEach((item) => {
    if (!item) return;
    const catName = (item.category_name || item.category || "General Menu").trim() || "General Menu";
    if (!categoryMap.has(catName)) {
      categoryMap.set(catName, []);
    }
    categoryMap.get(catName)!.push({
      name: String(item.name || "Unnamed Item").trim(),
      price: formatPriceDisplay(item.price),
    });
  });

  // Sort categories logically
  const sortedCategories = Array.from(categoryMap.keys()).sort((a, b) => {
    const rankA = getCategoryRank(a);
    const rankB = getCategoryRank(b);
    if (rankA !== rankB) return rankA - rankB;
    return a.localeCompare(b);
  });

  // Filter sections if categoryFilterName is provided
  const filter = (options?.categoryFilterName || "").toLowerCase().trim();
  const isFiltering = filter && filter !== "all" && filter !== "all categories";

  const targetCategoryKeys = isFiltering
    ? sortedCategories.filter((cat) => {
        const cLower = cat.toLowerCase();
        return cLower.includes(filter) || filter.includes(cLower);
      })
    : sortedCategories;

  const activeCategories = targetCategoryKeys.length > 0 ? targetCategoryKeys : sortedCategories;

  const sectionsToRender: MenuCategorySection[] = activeCategories.map((catTitle) => {
    const catItems = categoryMap.get(catTitle) || [];
    // Sort items alphabetically inside category
    catItems.sort((a, b) => a.name.localeCompare(b.name));
    const height = 9.4 + catItems.length * 4.5 + 2.5;
    return {
      title: catTitle.toUpperCase(),
      items: catItems,
      height,
    };
  });

  // Draw Page 1 Header Banner
  drawHeaderBanner();

  if (sectionsToRender.length === 0 || items.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(COLOR_TEXT_DARK[0], COLOR_TEXT_DARK[1], COLOR_TEXT_DARK[2]);
    doc.text("No menu items available in this category.", PAGE_WIDTH / 2, 60, { align: "center" });
    drawFooter();
    const fileDate = format(new Date(), "yyyyMMdd");
    doc.save(`queens_palace_menu_${fileDate}.pdf`);
    return;
  }

  // Check if content fits in 1 page and balance the 2 columns if so
  const totalHeight = sectionsToRender.reduce((acc, s) => acc + s.height, 0);
  const page1MaxColHeight = MAX_CONTENT_Y - MARGIN_TOP_P1; // ~239mm
  const fitsOnOnePage = totalHeight <= page1MaxColHeight * 1.8;
  const balanceTargetHeight = fitsOnOnePage ? totalHeight / 2 : page1MaxColHeight;

  let col0AccumulatedHeight = 0;

  sectionsToRender.forEach((sec, sIdx) => {
    // If balancing on Page 1 and Col 0 has reached roughly half the content, advance to Col 1
    if (
      fitsOnOnePage &&
      currentCol === 0 &&
      currentPage === 1 &&
      sIdx > 0 &&
      col0AccumulatedHeight >= balanceTargetHeight
    ) {
      advanceColumn();
    }

    if (sIdx > 0 && currentY > (currentPage === 1 ? MARGIN_TOP_P1 : MARGIN_TOP_P2)) {
      currentY += 1.5;
    }

    drawCategoryRibbon(sec.title);

    sec.items.forEach((it) => {
      drawMenuItem(it.name, it.price);
    });

    if (currentCol === 0 && currentPage === 1) {
      col0AccumulatedHeight += sec.height;
    }
  });

  // Final Page Footer
  drawFooter();

  const fileDate = format(new Date(), "yyyyMMdd");
  const filename = isFiltering
    ? `queens_palace_menu_${filter.replace(/\s+/g, "_")}_${fileDate}.pdf`
    : `queens_palace_full_menu_${fileDate}.pdf`;

  doc.save(filename);
};

/**
 * Exports menu catalog to a clean, well-formatted CSV with UTF-8 BOM.
 */
export const exportMenuToCSV = (items: any[], filename = "Queens_Palace_Menu_Catalog") => {
  const headers = [
    "Item ID",
    "Item Name",
    "Category",
    "Price (NGN)",
    "Stock Quantity",
    "Low Stock Threshold",
    "Availability Status",
    "Approval Status",
    "Description",
    "Image URL",
    "Date Created",
  ];

  const escapeCSV = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = items.map((item) => [
    escapeCSV(item.id),
    escapeCSV(item.name),
    escapeCSV(item.category_name || item.category || "Uncategorized"),
    escapeCSV(Number(item.price) || 0),
    escapeCSV(item.quantity_available ?? item.stockQuantity ?? 0),
    escapeCSV(item.low_stock_threshold ?? 5),
    escapeCSV(item.status || "available"),
    escapeCSV(item.approval_status || "approved"),
    escapeCSV(item.description || ""),
    escapeCSV(item.image_path || item.image || ""),
    escapeCSV(item.created_at || ""),
  ]);

  // \uFEFF ensures UTF-8 BOM so Excel on Windows handles currency symbols and special chars cleanly
  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${format(new Date(), "yyyyMMdd_HHmm")}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Exports menu catalog to Excel (.xlsx) with auto-sized columns.
 */
export const exportMenuToExcel = (items: any[], filename = "Queens_Palace_Menu_Catalog") => {
  const data = items.map((item, idx) => ({
    "#": idx + 1,
    "Item ID": item.id,
    "Item Name": item.name,
    "Category": item.category_name || item.category || "Uncategorized",
    "Price (NGN)": Number(item.price) || 0,
    "Stock Quantity": Number(item.quantity_available ?? item.stockQuantity ?? 0),
    "Low Stock Threshold": Number(item.low_stock_threshold ?? 5),
    "Availability Status": item.status || "available",
    "Approval Status": item.approval_status || "approved",
    "Description": item.description || "",
    "Image URL": item.image_path || item.image || "",
    "Date Created": item.created_at || "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet["!cols"] = [
    { wch: 5 },
    { wch: 8 },
    { wch: 28 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 35 },
    { wch: 35 },
    { wch: 20 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Menu Catalog");
  XLSX.writeFile(workbook, `${filename}_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
};
