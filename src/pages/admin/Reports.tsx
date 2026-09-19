import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
  getSalesReport, 
  downloadReportCSV, 
  getTransactionLedger, 
  getAllInventoryForReport 
} from "../../services/reportService";
import type { SalesReportData } from "../../types";
import { formatNaira } from "../../utils/format";
import { useUI } from "../../context/UIContext";
import {
  DollarSign,
  ShoppingBag,
  Package,
  TrendingUp,
  BarChart3,
  Download,
  FileText,
  FileSpreadsheet,
  Layers,
  CreditCard,
  Boxes,
  Receipt,
  X,
  CheckCircle2,
} from "lucide-react";
import { 
  exportToCSV, 
  exportToExcel, 
  exportToPDF,
  exportInventoryToCSV,
  exportInventoryToExcel,
  exportInventoryToPDF,
  exportTransactionsToCSV,
  exportTransactionsToExcel,
  exportTransactionsToPDF,
  exportSalesReportToCSV,
  exportSalesReportToExcel,
  exportSalesReportToPDF,
} from "../../utils/export";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { PageHeader, StatCard, Badge } from "../../components/ui";
import { Button } from "../../components/ui/Button";

type TimeRange = "today" | "week" | "month" | "all";
type ActiveTab = "overview" | "categories" | "payments" | "packaging";

export const Reports: React.FC = () => {
  const [salesData, setSalesData] = useState<SalesReportData | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("month");
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [loading, setLoading] = useState(true);
  const { showToast } = useUI();

  // Export Center State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState<"sales" | "transactions" | "inventory">("sales");
  const [exportFormat, setExportFormat] = useState<"excel" | "csv" | "pdf">("excel");
  const [isExporting, setIsExporting] = useState(false);

  const fetchReportData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getSalesReport({ period: timeRange });
      if (response.success && response.data) {
        setSalesData(response.data);
      }
    } catch {
      showToast("Failed to load business data", "error");
    } finally {
      setLoading(false);
    }
  }, [timeRange, showToast]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const stats = useMemo(() => {
    if (!salesData) {
      return {
        totalSales: 0,
        orderCount: 0,
        itemsCount: 0,
        avgTicket: 0,
        chartData: [],
        pieData: [],
        categoryData: [],
        paymentData: [],
      };
    }

    const totalSales = salesData.summary?.total_sales ?? 0;
    const foodSales = salesData.summary?.food_sales ?? (totalSales - (salesData.summary?.total_packaging_revenue ?? 0));
    const totalPackagingRevenue = salesData.summary?.total_packaging_revenue ?? (salesData.packaging?.summary?.total_packaging_revenue ?? 0);
    const totalPacksSold = salesData.summary?.total_packs_sold ?? (salesData.packaging?.summary?.total_packs_sold ?? 0);
    const packagingOrders = salesData.packaging?.summary?.orders_with_packaging ?? 0;
    const avgPacksPerOrder = salesData.packaging?.summary?.avg_packs_per_order ?? 0;
    const packagingTrend = salesData.packaging?.trend ?? [];

    const orderCount = salesData.summary?.order_count ?? 0;
    const avgTicket = salesData.summary?.avg_ticket ?? 0;
    const itemsCount =
      salesData.category_sales?.reduce((sum, c) => sum + (c.items_sold || 0), 0) ?? 0;

    const chartData = (salesData.sales_trend || []).map((t) => ({
      date: t.date,
      revenue: t.total_sales,
      orders: t.order_count,
    }));

    const pieData = (salesData.order_sources || []).map((s) => ({
      name: `${s.source} (${s.order_type})`,
      value: s.count,
    }));

    const categoryData = (salesData.category_sales || []).map((c) => ({
      name: c.category_name,
      sales: c.total_sales,
      items: c.items_sold,
    }));

    const paymentData = (salesData.payment_methods || []).map((p) => ({
      method: p.payment_method,
      amount: p.total_amount,
      count: p.tx_count,
    }));

    return {
      totalSales,
      foodSales,
      totalPackagingRevenue,
      totalPacksSold,
      packagingOrders,
      avgPacksPerOrder,
      packagingTrend,
      orderCount,
      itemsCount,
      avgTicket,
      chartData,
      pieData,
      categoryData,
      paymentData,
    };
  }, [salesData]);

  const executeExport = async (
    targetType: "sales" | "transactions" | "inventory" = exportType,
    targetFormat: "excel" | "csv" | "pdf" = exportFormat
  ) => {
    setIsExporting(true);
    showToast(`Preparing ${targetType} export as ${targetFormat.toUpperCase()}...`, "info");
    try {
      if (targetType === "inventory") {
        const invRes = await getAllInventoryForReport();
        const items = invRes.data?.all_items || invRes.data?.low_stock_items || [];
        if (items.length === 0) {
          showToast("No inventory records found to export", "warning");
          return;
        }

        if (targetFormat === "csv") {
          try {
            await downloadReportCSV("inventory");
            showToast("Inventory report downloaded successfully", "success");
            setShowExportModal(false);
            return;
          } catch {
            exportInventoryToCSV(items);
          }
        } else if (targetFormat === "excel") {
          exportInventoryToExcel(items);
        } else {
          exportInventoryToPDF(items);
        }
        showToast(`Exported ${items.length} inventory items successfully`, "success");
      } else if (targetType === "transactions") {
        // Fetch all transactions regardless of amount (no limit cap)
        const txRes = await getTransactionLedger({ period: timeRange, per_page: 5000 });
        const txs = txRes.data || [];
        if (txs.length === 0) {
          showToast("No transactions found in this period", "warning");
          return;
        }

        if (targetFormat === "csv") {
          try {
            await downloadReportCSV("transactions");
            showToast("Transaction ledger downloaded successfully", "success");
            setShowExportModal(false);
            return;
          } catch {
            exportTransactionsToCSV(txs);
          }
        } else if (targetFormat === "excel") {
          exportTransactionsToExcel(txs);
        } else {
          exportTransactionsToPDF(txs);
        }
        showToast(`Exported ${txs.length} transactions successfully`, "success");
      } else {
        // Sales & Revenue Performance Report
        if (!salesData || stats.chartData.length === 0) {
          showToast("No sales data available in this period", "warning");
          return;
        }

        if (targetFormat === "csv") {
          try {
            await downloadReportCSV("sales");
            showToast("Sales report downloaded successfully", "success");
            setShowExportModal(false);
            return;
          } catch {
            exportSalesReportToCSV(salesData);
          }
        } else if (targetFormat === "excel") {
          exportSalesReportToExcel(salesData);
        } else {
          exportSalesReportToPDF(salesData);
        }
        showToast("Sales report generated successfully", "success");
      }
      setShowExportModal(false);
    } catch (err: any) {
      console.error("Export error:", err);
      showToast(err.message || "Failed to export report", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExport = async (format: "csv" | "excel" | "pdf") => {
    await executeExport(exportType, format);
  };

  const PIE_COLORS = ["#8B1E1E", "#D4AF37", "#1E7A3E", "#2563EB", "#7C3AED"];

  return (
    <div className="space-y-6">
      {/* Page Header with Time Range Selector and Export Options */}
      <PageHeader
        title="Reports & Analytics"
        description="Monitor sales volume, revenue flow, category distributions, and payment settlement breakdown."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Range Pills */}
            <div className="inline-flex p-0.5 rounded-lg bg-stone-100 border border-stone-200">
              {(["today", "week", "month", "all"] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                    timeRange === range
                      ? "bg-white text-stone-900 shadow-xs"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            {/* Export buttons */}
            <div className="inline-flex items-center gap-1.5">
              <Button
                variant="primary"
                size="sm"
                icon={<Download size={14} />}
                onClick={() => setShowExportModal(true)}
              >
                Export Center
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<FileText size={14} className="text-red-700" />}
                onClick={() => handleExport("pdf")}
                disabled={isExporting}
              >
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<FileSpreadsheet size={14} className="text-emerald-700" />}
                onClick={() => handleExport("excel")}
                disabled={isExporting}
              >
                Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Download size={14} className="text-stone-600" />}
                onClick={() => handleExport("csv")}
                disabled={isExporting}
              >
                CSV
              </Button>
            </div>
          </div>
        }
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Food Sales"
          value={formatNaira(stats.foodSales)}
          subtext="Excluding packaging"
          icon={<DollarSign size={16} />}
        />
        <StatCard
          label="Packaging Revenue"
          value={formatNaira(stats.totalPackagingRevenue)}
          subtext={`${stats.totalPacksSold} packs sold`}
          icon={<Package size={16} />}
        />
        <StatCard
          label="Gross Revenue"
          value={formatNaira(stats.totalSales)}
          subtext="All collections"
          trend="up"
          icon={<TrendingUp size={16} />}
        />
        <StatCard
          label="Completed Orders"
          value={stats.orderCount.toLocaleString()}
          change="+5% volume"
          trend="up"
          icon={<ShoppingBag size={16} />}
        />
        <StatCard
          label="Portions Sold"
          value={stats.itemsCount.toLocaleString()}
          subtext="Total items"
          icon={<Layers size={16} />}
        />
      </div>

      {/* Analytics Tabs */}
      <div className="border-b border-stone-200">
        <nav className="flex gap-4">
          {[
            { id: "overview", label: "Revenue & Trend", icon: BarChart3 },
            { id: "packaging", label: "Takeaway Packaging", icon: Package },
            { id: "categories", label: "Category Performance", icon: Layers },
            { id: "payments", label: "Payment Channels", icon: CreditCard },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as ActiveTab)}
                className={`pb-3 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-colors ${
                  isActive
                    ? "border-[#8B1E1E] text-stone-900"
                    : "border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300"
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {loading && !salesData ? (
        <div className="py-20 flex flex-col items-center justify-center bg-white rounded-lg border border-stone-200">
          <div className="w-7 h-7 border-2 border-[#8B1E1E] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs text-stone-500 font-medium">Compiling financial metrics...</p>
        </div>
      ) : (
        <>
          {/* Tab 1: Overview & Trend */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Revenue Area Chart */}
              <div className="lg:col-span-2 bg-white p-5 rounded-lg border border-stone-200 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-stone-900">Revenue Trajectory</h3>
                    <p className="text-xs text-stone-500">Gross daily sales for the selected period</p>
                  </div>
                  <Badge variant="neutral" size="sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8B1E1E] mr-1.5" />
                    Revenue Trend
                  </Badge>
                </div>

                <div className="h-[320px] w-full">
                  {stats.chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={stats.chartData}
                        margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="reportRevGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8B1E1E" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#8B1E1E" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0eee9" />
                        <XAxis
                          dataKey="date"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#78716c", fontSize: 11 }}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#78716c", fontSize: 11 }}
                          tickFormatter={(val) => `₦${(val / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "8px",
                            border: "1px solid #e7e5e4",
                            boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                            fontSize: "12px",
                          }}
                          formatter={(val: number) => [formatNaira(val), "Revenue"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="#8B1E1E"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#reportRevGrad)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-stone-400">
                      No sales data recorded for this period
                    </div>
                  )}
                </div>
              </div>

              {/* Order Sources Breakdown */}
              <div className="bg-white p-5 rounded-lg border border-stone-200 shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-stone-900 mb-0.5">Order Sources</h3>
                  <p className="text-xs text-stone-500">POS register vs Online ordering volume</p>
                </div>

                <div className="h-[200px] flex items-center justify-center relative my-2">
                  {stats.pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {stats.pieData.map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={PIE_COLORS[index % PIE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-xs text-stone-400">No channel data</div>
                  )}
                </div>

                <div className="space-y-1.5">
                  {stats.pieData.map((d, i) => (
                    <div
                      key={d.name}
                      className="flex justify-between items-center bg-stone-50 px-3 py-2 rounded-md border border-stone-200 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="font-medium text-stone-700 capitalize truncate">
                          {d.name}
                        </span>
                      </div>
                      <span className="font-semibold text-stone-900 shrink-0 ml-2">
                        {d.value} ({Math.round((d.value / (stats.orderCount || 1)) * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Category Mix */}
          {activeTab === "categories" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white p-5 rounded-lg border border-stone-200 shadow-xs">
                <h3 className="text-sm font-semibold text-stone-900 mb-0.5">Sales by Category</h3>
                <p className="text-xs text-stone-500 mb-5">Revenue volume across culinary departments</p>

                <div className="h-[300px] w-full">
                  {stats.categoryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.categoryData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0eee9" />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#78716c", fontSize: 11 }}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#78716c", fontSize: 11 }}
                          tickFormatter={(val) => `₦${(val / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "8px",
                            border: "1px solid #e7e5e4",
                            fontSize: "12px",
                          }}
                          formatter={(val: number) => [formatNaira(val), "Sales"]}
                        />
                        <Bar dataKey="sales" fill="#8B1E1E" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-stone-400">
                      No category sales recorded
                    </div>
                  )}
                </div>
              </div>

              {/* Category Breakdown Table */}
              <div className="bg-white p-5 rounded-lg border border-stone-200 shadow-xs">
                <h3 className="text-sm font-semibold text-stone-900 mb-3">Department Summary</h3>
                <div className="space-y-2 max-h-[320px] overflow-y-auto">
                  {stats.categoryData.map((cat, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-xs"
                    >
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="font-medium text-stone-900">{cat.name}</span>
                        <span className="font-semibold text-[#8B1E1E]">{formatNaira(cat.sales)}</span>
                      </div>
                      <div className="text-[11px] text-stone-500">{cat.items} portions sold</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Payment Tender Channels */}
          {activeTab === "payments" && (
            <div className="bg-white rounded-lg border border-stone-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-stone-200">
                <h3 className="text-sm font-semibold text-stone-900">Payment Tender Channels</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Transactions grouped by payment gateway and cashier tender methods
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50 text-stone-500 font-medium">
                      <th className="py-3 px-4">Tender Method</th>
                      <th className="py-3 px-4 text-center">Transactions</th>
                      <th className="py-3 px-4 text-right">Settled Volume</th>
                      <th className="py-3 px-4 text-right">Share of Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-700">
                    {stats.paymentData.length > 0 ? (
                      stats.paymentData.map((pm, idx) => (
                        <tr key={idx} className="hover:bg-stone-50 transition-colors h-12">
                          <td className="py-2.5 px-4 font-medium text-stone-900 capitalize">
                            {pm.method}
                          </td>
                          <td className="py-2.5 px-4 text-center text-stone-600 font-mono">
                            {pm.count}
                          </td>
                          <td className="py-2.5 px-4 text-right font-medium text-stone-900">
                            {formatNaira(pm.amount)}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <Badge variant="neutral" size="sm">
                              {stats.totalSales > 0
                                ? Math.round((pm.amount / stats.totalSales) * 100)
                                : 0}
                              %
                            </Badge>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-stone-400">
                          No payment breakdown recorded
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 4: Takeaway Packaging Revenue */}
          {activeTab === "packaging" && (
            <div className="space-y-6">
              {/* Packaging Highlight Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-lg border border-stone-200 shadow-xs">
                  <div className="text-xs text-stone-500 font-medium">Total Packs Sold</div>
                  <div className="text-2xl font-bold text-stone-900 mt-1 font-mono">
                    {stats.totalPacksSold.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-stone-400 mt-0.5">Containers utilized</div>
                </div>

                <div className="bg-white p-5 rounded-lg border border-stone-200 shadow-xs">
                  <div className="text-xs text-stone-500 font-medium">Packaging Revenue</div>
                  <div className="text-2xl font-bold text-[#8B1E1E] mt-1 font-mono">
                    {formatNaira(stats.totalPackagingRevenue)}
                  </div>
                  <div className="text-[11px] text-stone-400 mt-0.5">Total packaging charges</div>
                </div>

                <div className="bg-white p-5 rounded-lg border border-stone-200 shadow-xs">
                  <div className="text-xs text-stone-500 font-medium">Orders With Packaging</div>
                  <div className="text-2xl font-bold text-stone-900 mt-1 font-mono">
                    {stats.packagingOrders.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-stone-400 mt-0.5">Orders requiring packs</div>
                </div>

                <div className="bg-white p-5 rounded-lg border border-stone-200 shadow-xs">
                  <div className="text-xs text-stone-500 font-medium">Avg Packs / Order</div>
                  <div className="text-2xl font-bold text-stone-900 mt-1 font-mono">
                    {stats.avgPacksPerOrder}
                  </div>
                  <div className="text-[11px] text-stone-400 mt-0.5">Average container density</div>
                </div>
              </div>

              {/* Packaging Breakdown Table */}
              <div className="bg-white rounded-lg border border-stone-200 shadow-xs overflow-hidden">
                <div className="p-5 border-b border-stone-200">
                  <h3 className="text-sm font-semibold text-stone-900">Packaging Charges by Date Range</h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Separately tracked takeaway container volumes and revenue flow
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50 text-stone-500 font-medium">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4 text-center">Packs Sold</th>
                        <th className="py-3 px-4 text-right">Packaging Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-stone-700">
                      {stats.packagingTrend.length > 0 ? (
                        stats.packagingTrend.map((row, idx) => (
                          <tr key={idx} className="hover:bg-stone-50 transition-colors h-11">
                            <td className="py-2.5 px-4 font-medium text-stone-900">
                              {row.date}
                            </td>
                            <td className="py-2.5 px-4 text-center font-mono text-stone-600">
                              {row.packs_sold}
                            </td>
                            <td className="py-2.5 px-4 text-right font-medium text-[#8B1E1E] font-mono">
                              {formatNaira(row.packaging_revenue)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-stone-400">
                            No packaging charges recorded in this date range
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Export Center Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 max-w-lg w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#8B1E1E]/10 flex items-center justify-center text-[#8B1E1E]">
                  <Download size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">Export Management Reports</h3>
                  <p className="text-xs text-stone-500">
                    Export enriched financial, transaction, and inventory datasets.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-200/60 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-5">
              {/* Report Type Selector */}
              <div>
                <label className="text-xs font-semibold text-stone-700 block mb-2">
                  Select Report Dataset
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportType("sales")}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      exportType === "sales"
                        ? "border-[#8B1E1E] bg-[#8B1E1E]/5 ring-1 ring-[#8B1E1E]"
                        : "border-stone-200 hover:border-stone-300 bg-white"
                    }`}
                  >
                    <TrendingUp size={18} className={exportType === "sales" ? "text-[#8B1E1E]" : "text-stone-400"} />
                    <div className="flex-1">
                      <span className="text-xs font-bold text-stone-900 block">
                        Sales & Revenue Performance
                      </span>
                      <span className="text-[11px] text-stone-500 block mt-0.5">
                        Daily gross sales, average ticket, packaging fees, and channel distributions ({timeRange}).
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportType("transactions")}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      exportType === "transactions"
                        ? "border-[#8B1E1E] bg-[#8B1E1E]/5 ring-1 ring-[#8B1E1E]"
                        : "border-stone-200 hover:border-stone-300 bg-white"
                    }`}
                  >
                    <Receipt size={18} className={exportType === "transactions" ? "text-[#8B1E1E]" : "text-stone-400"} />
                    <div className="flex-1">
                      <span className="text-xs font-bold text-stone-900 block">
                        Transaction Ledger (Unlimited)
                      </span>
                      <span className="text-[11px] text-stone-500 block mt-0.5">
                        Every single transaction line with order #, customer, cashier, amount, method, and status regardless of volume.
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportType("inventory")}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      exportType === "inventory"
                        ? "border-[#8B1E1E] bg-[#8B1E1E]/5 ring-1 ring-[#8B1E1E]"
                        : "border-stone-200 hover:border-stone-300 bg-white"
                    }`}
                  >
                    <Boxes size={18} className={exportType === "inventory" ? "text-[#8B1E1E]" : "text-stone-400"} />
                    <div className="flex-1">
                      <span className="text-xs font-bold text-stone-900 block">
                        Inventory Valuation & Stock Health
                      </span>
                      <span className="text-[11px] text-stone-500 block mt-0.5">
                        All tracked menu dishes, available portions, unit prices, alert thresholds, and total asset valuation.
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Format Selector */}
              <div>
                <label className="text-xs font-semibold text-stone-700 block mb-2">
                  Choose Export Format
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportFormat("excel")}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                      exportFormat === "excel"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600 font-bold"
                        : "border-stone-200 hover:border-stone-300 text-stone-700 bg-white text-xs font-medium"
                    }`}
                  >
                    <FileSpreadsheet size={20} className="text-emerald-700 mb-1" />
                    <span className="text-xs">Excel (.xlsx)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportFormat("csv")}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                      exportFormat === "csv"
                        ? "border-[#8B1E1E] bg-[#8B1E1E]/5 text-stone-900 ring-1 ring-[#8B1E1E] font-bold"
                        : "border-stone-200 hover:border-stone-300 text-stone-700 bg-white text-xs font-medium"
                    }`}
                  >
                    <Download size={20} className="text-stone-600 mb-1" />
                    <span className="text-xs">CSV (.csv)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportFormat("pdf")}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                      exportFormat === "pdf"
                        ? "border-red-600 bg-red-50 text-red-900 ring-1 ring-red-600 font-bold"
                        : "border-stone-200 hover:border-stone-300 text-stone-700 bg-white text-xs font-medium"
                    }`}
                  >
                    <FileText size={20} className="text-red-700 mb-1" />
                    <span className="text-xs">PDF Document</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                disabled={isExporting}
                className="px-4 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeExport(exportType, exportFormat)}
                disabled={isExporting}
                className="inline-flex items-center gap-2 px-5 py-2 bg-[#8B1E1E] hover:bg-[#731818] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Generating Export...</span>
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    <span>Download {exportFormat.toUpperCase()}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
