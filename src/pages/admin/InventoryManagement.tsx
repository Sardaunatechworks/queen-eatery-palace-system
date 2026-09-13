import React, { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { formatNaira } from "../../utils/format";
import { resolveMediaUrl } from "../../utils/media";
import { useUI } from "../../context/UIContext";
import {
  Boxes,
  PackagePlus,
  Trash2,
  SlidersHorizontal,
  History,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Search,
  Filter,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  TrendingDown,
  FileSpreadsheet,
  FileText,
  Calendar,
  Clock,
  User,
  ShieldCheck,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { PageHeader, Badge, ActionDropdown } from "../../components/ui";
import { Input, Select, TextArea } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import type { InventoryItem, StockMovement, InventorySummaryStats, Category } from "../../types";
import {
  getInventory,
  getInventorySummary,
  getAllStockMovements,
  getStockHistory,
  stockInItem,
  recordItemWastage,
  adjustItemStock,
  getCategories,
} from "../../services/menuService";

export const InventoryManagement: React.FC = () => {
  const { showToast } = useUI();

  // Primary data state
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummaryStats>({
    total_tracked_items: 0,
    low_stock_count: 0,
    out_of_stock_count: 0,
    movements_today: 0,
    total_valuation: 0,
  });
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // View & Filter states
  const [activeTab, setActiveTab] = useState<"inventory" | "movements">("inventory");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<"all" | "in_stock" | "low_stock" | "out_of_stock" | "unlimited">("all");

  // Modals state
  const [stockInModalOpen, setStockInModalOpen] = useState(false);
  const [wastageModalOpen, setWastageModalOpen] = useState(false);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // Selected item for modal operations
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [itemHistory, setItemHistory] = useState<StockMovement[]>([]);
  const [loadingItemHistory, setLoadingItemHistory] = useState(false);

  // Form states
  const [formQuantity, setFormQuantity] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formWastageType, setFormWastageType] = useState<"wastage" | "damaged">("wastage");
  const [formThreshold, setFormThreshold] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Initial Load
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [invData, summaryData, movementsData, catData] = await Promise.all([
        getInventory(),
        getInventorySummary(),
        getAllStockMovements(100),
        getCategories(),
      ]);

      setItems(invData || []);
      setSummary(summaryData);
      setMovements(movementsData || []);
      setCategories(catData || []);
    } catch (err: any) {
      console.error("Failed to load inventory data:", err);
      showToast(err.message || "Failed to load inventory", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered inventory items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const name = item.item_name || item.menu_item_name || "";
      const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCat =
        selectedCategory === "all" ||
        item.category_name?.toLowerCase() === selectedCategory.toLowerCase();

      let matchesStatus = true;
      const isUnlimited = item.track_inventory === false;
      const isOutOfStock = !isUnlimited && item.quantity <= 0;
      const isLowStock = !isUnlimited && item.quantity > 0 && item.quantity <= item.low_stock_threshold;
      const isInStock = !isUnlimited && item.quantity > item.low_stock_threshold;

      if (selectedStatus === "unlimited") {
        matchesStatus = isUnlimited;
      } else if (selectedStatus === "out_of_stock") {
        matchesStatus = isOutOfStock;
      } else if (selectedStatus === "low_stock") {
        matchesStatus = isLowStock;
      } else if (selectedStatus === "in_stock") {
        matchesStatus = isInStock;
      }

      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [items, searchTerm, selectedCategory, selectedStatus]);

  // Handlers to open modals
  const handleOpenStockIn = (item?: InventoryItem) => {
    setSelectedItem(item || items[0] || null);
    setFormQuantity("");
    setFormNotes("Restock / Daily Batch Preparation");
    setStockInModalOpen(true);
  };

  const handleOpenWastage = (item?: InventoryItem) => {
    setSelectedItem(item || items[0] || null);
    setFormQuantity("");
    setFormNotes("");
    setFormWastageType("wastage");
    setWastageModalOpen(true);
  };

  const handleOpenAdjust = (item: InventoryItem) => {
    setSelectedItem(item);
    setFormQuantity(item.quantity.toString());
    setFormThreshold(item.low_stock_threshold.toString());
    setFormNotes("Physical inventory audit count");
    setAdjustModalOpen(true);
  };

  const handleOpenHistory = async (item: InventoryItem) => {
    setSelectedItem(item);
    setHistoryModalOpen(true);
    setLoadingItemHistory(true);
    try {
      const hist = await getStockHistory(item.menu_item_id, 50);
      setItemHistory(hist || []);
    } catch (err: any) {
      showToast(err.message || "Failed to load item movement history", "error");
    } finally {
      setLoadingItemHistory(false);
    }
  };

  // Submit Stock In
  const handleStockInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    const qty = parseFloat(formQuantity);
    if (isNaN(qty) || qty <= 0) {
      showToast("Please enter a valid quantity greater than 0", "warning");
      return;
    }

    setSubmitting(true);
    try {
      await stockInItem(selectedItem.menu_item_id, qty, formNotes);
      showToast(
        `Added ${qty} ${selectedItem.unit_of_measure || "portions"} to "${selectedItem.item_name}"`,
        "success"
      );
      setStockInModalOpen(false);
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || "Failed to add stock", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Wastage
  const handleWastageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    const qty = parseFloat(formQuantity);
    if (isNaN(qty) || qty <= 0) {
      showToast("Please enter a valid quantity greater than 0", "warning");
      return;
    }

    if (qty > selectedItem.quantity) {
      showToast(
        `Cannot record wastage exceeding current stock (${selectedItem.quantity})`,
        "warning"
      );
      return;
    }

    if (!formNotes.trim()) {
      showToast("Please state a reason for this wastage for auditing purposes", "warning");
      return;
    }

    setSubmitting(true);
    try {
      await recordItemWastage(selectedItem.menu_item_id, qty, formNotes, formWastageType);
      showToast(
        `Recorded ${qty} ${selectedItem.unit_of_measure || "portions"} as ${formWastageType} for "${selectedItem.item_name}"`,
        "success"
      );
      setWastageModalOpen(false);
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || "Failed to record wastage", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Manual Adjust
  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    const qty = parseFloat(formQuantity);
    if (isNaN(qty) || qty < 0) {
      showToast("Quantity cannot be negative", "warning");
      return;
    }

    const thresh = formThreshold !== "" ? parseFloat(formThreshold) : undefined;
    if (thresh !== undefined && (isNaN(thresh) || thresh < 0)) {
      showToast("Threshold cannot be negative", "warning");
      return;
    }

    if (!formNotes.trim()) {
      showToast("Please enter an audit note or reason for manual adjustment", "warning");
      return;
    }

    setSubmitting(true);
    try {
      await adjustItemStock(selectedItem.menu_item_id, qty, formNotes, thresh);
      showToast(`Stock for "${selectedItem.item_name}" adjusted to ${qty}`, "success");
      setAdjustModalOpen(false);
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || "Failed to adjust stock", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Format Movement Type Label & Color Badge
  const renderMovementBadge = (type: string) => {
    switch (type) {
      case "stock_in":
      case "add":
        return <Badge variant="success" size="sm">Stock In</Badge>;
      case "order_deduct":
      case "deduction":
        return <Badge variant="error" size="sm">Order Deducted</Badge>;
      case "order_restore":
        return <Badge variant="info" size="sm">Order Restored</Badge>;
      case "wastage":
        return <Badge variant="warning" size="sm">Food Waste</Badge>;
      case "damaged":
        return <Badge variant="error" size="sm">Damaged</Badge>;
      case "manual_adjust":
      case "adjustment":
        return <Badge variant="neutral" size="sm">Manual Adjust</Badge>;
      case "initial":
        return <Badge variant="neutral" size="sm">Initial Setup</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Inventory Management"
        description="Monitor real-time portion availability, record restocks, log kitchen wastage, and prevent food overselling."
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="md"
              icon={<RefreshCw size={15} className={refreshing ? "animate-spin text-stone-600" : "text-stone-600"} />}
              onClick={() => loadData(true)}
              disabled={refreshing || loading}
            >
              Refresh
            </Button>

            <Button
              type="button"
              variant="outline"
              size="md"
              icon={<Trash2 size={15} className="text-amber-700" />}
              onClick={() => handleOpenWastage()}
            >
              Record Wastage
            </Button>

            <Button
              type="button"
              variant="primary"
              size="md"
              icon={<PackagePlus size={16} />}
              onClick={() => handleOpenStockIn()}
            >
              Stock In / Restock
            </Button>
          </div>
        }
      />

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        {/* Tracked Items */}
        <div
          onClick={() => setSelectedStatus("all")}
          className={`bg-white rounded-xl p-4 border transition-all cursor-pointer shadow-xs hover:shadow-md ${
            selectedStatus === "all" ? "border-stone-400 ring-2 ring-stone-400/20" : "border-stone-200"
          }`}
        >
          <div className="flex items-center justify-between text-stone-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Tracked Dishes</span>
            <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-700">
              <Boxes size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-stone-900">{summary.total_tracked_items}</div>
          <p className="text-[11px] text-stone-500 mt-1">Dishes with portion tracking</p>
        </div>

        {/* Low Stock Items */}
        <div
          onClick={() => setSelectedStatus("low_stock")}
          className={`bg-white rounded-xl p-4 border transition-all cursor-pointer shadow-xs hover:shadow-md ${
            selectedStatus === "low_stock" ? "border-amber-400 ring-2 ring-amber-400/20" : "border-stone-200"
          }`}
        >
          <div className="flex items-center justify-between text-amber-700 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Low Stock</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-900">{summary.low_stock_count}</div>
          <p className="text-[11px] text-amber-700/80 mt-1">At or below alert threshold</p>
        </div>

        {/* Out of Stock Items */}
        <div
          onClick={() => setSelectedStatus("out_of_stock")}
          className={`bg-white rounded-xl p-4 border transition-all cursor-pointer shadow-xs hover:shadow-md ${
            selectedStatus === "out_of_stock" ? "border-red-400 ring-2 ring-red-400/20" : "border-stone-200"
          }`}
        >
          <div className="flex items-center justify-between text-red-600 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Out of Stock</span>
            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <XCircle size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-red-700">{summary.out_of_stock_count}</div>
          <p className="text-[11px] text-red-600/80 mt-1">Blocked on Customer/POS</p>
        </div>

        {/* Movements Today */}
        <div
          onClick={() => setActiveTab("movements")}
          className="bg-white rounded-xl p-4 border border-stone-200 transition-all cursor-pointer shadow-xs hover:shadow-md"
        >
          <div className="flex items-center justify-between text-blue-600 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Today's Moves</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <History size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-stone-900">{summary.movements_today}</div>
          <p className="text-[11px] text-stone-500 mt-1">Stock events recorded today</p>
        </div>

        {/* Total Stock Valuation */}
        <div className="bg-gradient-to-br from-stone-900 to-stone-800 text-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-stone-300 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Stock Valuation</span>
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-amber-400">
              <Sparkles size={16} />
            </div>
          </div>
          <div className="text-xl font-bold text-amber-300">{formatNaira(summary.total_valuation)}</div>
          <p className="text-[11px] text-stone-400 mt-1">Selling value on shelf</p>
        </div>
      </div>

      {/* Main Tabs Header */}
      <div className="flex items-center justify-between border-b border-stone-200">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setActiveTab("inventory")}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === "inventory"
                ? "border-[#8B1E1E] text-[#8B1E1E]"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <Boxes size={16} />
            <span>Stock Inventory</span>
            <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 text-xs font-bold">
              {filteredItems.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("movements")}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === "movements"
                ? "border-[#8B1E1E] text-[#8B1E1E]"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <History size={16} />
            <span>Audit History & Movements</span>
            <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 text-xs font-bold">
              {movements.length}
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: INVENTORY TABLE */}
      {activeTab === "inventory" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white rounded-xl p-3 border border-stone-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                placeholder="Search dish by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#8B1E1E]/20 focus:border-[#8B1E1E]"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-medium text-stone-700 focus:outline-none focus:border-[#8B1E1E]"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as any)}
                className="px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-medium text-stone-700 focus:outline-none focus:border-[#8B1E1E]"
              >
                <option value="all">All Stock Statuses</option>
                <option value="in_stock">In Stock (&gt; Threshold)</option>
                <option value="low_stock">Low Stock (≤ Threshold)</option>
                <option value="out_of_stock">Out of Stock (0)</option>
                <option value="unlimited">Unlimited (Not Tracked)</option>
              </select>
            </div>
          </div>

          {/* Inventory Table */}
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-stone-700">
                <thead className="bg-stone-50/80 text-[11px] font-bold uppercase tracking-wider text-stone-500 border-b border-stone-200">
                  <tr>
                    <th className="py-3 px-4">Menu Dish</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Portion Stock Level</th>
                    <th className="py-3 px-4">Threshold</th>
                    <th className="py-3 px-4">Unit Price</th>
                    <th className="py-3 px-4">Stock Value</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-stone-500">
                        <div className="w-8 h-8 border-3 border-[#8B1E1E] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-xs font-medium">Loading inventory records...</p>
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-stone-400">
                        <Boxes size={32} className="mx-auto mb-2 text-stone-300" />
                        <p className="text-sm font-medium text-stone-600">No inventory records found</p>
                        <p className="text-xs text-stone-400 mt-0.5">Try refining your search or filters</p>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const isUnlimited = item.track_inventory === false;
                      const isOutOfStock = !isUnlimited && item.quantity <= 0;
                      const isLowStock = !isUnlimited && item.quantity > 0 && item.quantity <= item.low_stock_threshold;
                      const uom = item.unit_of_measure || "portions";
                      const itemValuation = (item.item_price || 0) * item.quantity;

                      return (
                        <tr key={item.id} className="hover:bg-stone-50/60 transition-colors">
                          {/* Dish Info */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={resolveMediaUrl(item.item_image) || "/queen-logo.png"}
                                alt={item.item_name}
                                className="w-10 h-10 rounded-lg object-cover bg-stone-100 border border-stone-200 shrink-0"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = "/queen-logo.png";
                                }}
                              />
                              <div>
                                <span className="font-semibold text-stone-900 block truncate max-w-[200px]">
                                  {item.item_name}
                                </span>
                                <span className="text-[11px] text-stone-400 block">
                                  ID #{item.menu_item_id}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Category */}
                          <td className="py-3 px-4">
                            <span className="text-xs font-medium text-stone-600 bg-stone-100 px-2 py-0.5 rounded">
                              {item.category_name || "Uncategorized"}
                            </span>
                          </td>

                          {/* Current Stock */}
                          <td className="py-3 px-4">
                            {isUnlimited ? (
                              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                Unlimited Stock
                              </span>
                            ) : (
                              <div>
                                <div className="flex items-center gap-1.5 font-bold text-sm text-stone-900">
                                  <span>{item.quantity}</span>
                                  <span className="text-xs font-normal text-stone-500 lowercase">{uom}</span>
                                </div>
                                {/* Visual Stock Bar */}
                                <div className="w-24 bg-stone-200 rounded-full h-1.5 mt-1 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      isOutOfStock
                                        ? "bg-red-500 w-0"
                                        : isLowStock
                                        ? "bg-amber-500"
                                        : "bg-emerald-500"
                                    }`}
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        Math.max(5, (item.quantity / Math.max(item.low_stock_threshold * 3, 20)) * 100)
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Threshold */}
                          <td className="py-3 px-4">
                            {isUnlimited ? (
                              <span className="text-xs text-stone-400">—</span>
                            ) : (
                              <span className="text-xs text-stone-600 font-medium">
                                ≤ {item.low_stock_threshold} {uom}
                              </span>
                            )}
                          </td>

                          {/* Unit Price */}
                          <td className="py-3 px-4 font-medium text-stone-800">
                            {formatNaira(item.item_price || 0)}
                          </td>

                          {/* Total Valuation */}
                          <td className="py-3 px-4 font-semibold text-stone-900">
                            {isUnlimited ? "—" : formatNaira(itemValuation)}
                          </td>

                          {/* Status Badge */}
                          <td className="py-3 px-4">
                            {isUnlimited ? (
                              <Badge variant="info" size="sm">Always Available</Badge>
                            ) : isOutOfStock ? (
                              <Badge variant="error" size="sm">Out of Stock</Badge>
                            ) : isLowStock ? (
                              <Badge variant="warning" size="sm">Low Stock</Badge>
                            ) : (
                              <Badge variant="success" size="sm">In Stock</Badge>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenStockIn(item)}
                                className="h-7 px-2 text-xs font-semibold rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                                title="Add stock"
                              >
                                + Stock
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenWastage(item)}
                                className="h-7 px-2 text-xs font-semibold rounded bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer"
                                title="Log wastage or spoiled stock"
                              >
                                Waste
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenAdjust(item)}
                                className="h-7 px-2 text-xs font-semibold rounded bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors cursor-pointer"
                                title="Adjust physical stock count"
                              >
                                Adjust
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenHistory(item)}
                                className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                                title="View movement history"
                              >
                                <History size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AUDIT HISTORY / RECENT MOVEMENTS */}
      {activeTab === "movements" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">Stock Movement Audit Trail</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Complete immutable ledger of orders deducted, restocks, cancellations, and kitchen wastage.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />}
                onClick={() => loadData(true)}
              >
                Reload Log
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-stone-700">
                <thead className="bg-stone-50/80 text-[11px] font-bold uppercase tracking-wider text-stone-500 border-b border-stone-200">
                  <tr>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Menu Dish</th>
                    <th className="py-3 px-4">Movement Type</th>
                    <th className="py-3 px-4">Qty Change</th>
                    <th className="py-3 px-4">Before → After</th>
                    <th className="py-3 px-4">Reference / Order</th>
                    <th className="py-3 px-4">Audit Notes</th>
                    <th className="py-3 px-4">Staff Member</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-mono text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-stone-500 font-sans">
                        <div className="w-8 h-8 border-3 border-[#8B1E1E] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        Loading movement log...
                      </td>
                    </tr>
                  ) : movements.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-stone-400 font-sans">
                        <History size={32} className="mx-auto mb-2 text-stone-300" />
                        No movements recorded yet
                      </td>
                    </tr>
                  ) : (
                    movements.map((m) => {
                      const isPositive = ["stock_in", "add", "order_restore", "initial"].includes(m.movement_type);
                      const isNegative = ["order_deduct", "deduction", "wastage", "damaged"].includes(m.movement_type);

                      return (
                        <tr key={m.id} className="hover:bg-stone-50/60 transition-colors">
                          <td className="py-3 px-4 text-stone-500 whitespace-nowrap">
                            {format(new Date(m.created_at.replace(/-/g, "/")), "MMM d, yyyy h:mm a")}
                          </td>
                          <td className="py-3 px-4 font-sans font-semibold text-stone-900">
                            {m.item_name || `Item #${m.menu_item_id || ""}`}
                          </td>
                          <td className="py-3 px-4 font-sans">{renderMovementBadge(m.movement_type)}</td>
                          <td className="py-3 px-4 font-bold">
                            <span
                              className={
                                isPositive
                                  ? "text-emerald-600"
                                  : isNegative
                                  ? "text-red-600"
                                  : "text-stone-700"
                              }
                            >
                              {isPositive ? `+${m.quantity}` : isNegative ? `-${m.quantity}` : m.quantity}{" "}
                              <span className="font-normal text-[10px] text-stone-400 lowercase">
                                {m.unit_of_measure || "pts"}
                              </span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-stone-600">
                            {m.quantity_before !== null && m.quantity_after !== null ? (
                              <span>
                                {m.quantity_before} → <strong className="text-stone-900">{m.quantity_after}</strong>
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-3 px-4 text-stone-700 font-sans">
                            <span className="bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded text-[11px]">
                              {m.reference_id || "SYSTEM"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-stone-600 font-sans max-w-[200px] truncate" title={m.notes || ""}>
                            {m.notes || <span className="text-stone-400">—</span>}
                          </td>
                          <td className="py-3 px-4 text-stone-700 font-sans">
                            <div className="flex items-center gap-1">
                              <User size={12} className="text-stone-400 shrink-0" />
                              <span className="truncate">{m.created_by_name || "System"}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: STOCK IN / RESTOCK */}
      {stockInModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-stone-200 w-full max-w-md shadow-xl overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <PackagePlus size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">Stock In / Restock</h3>
                  <p className="text-xs text-stone-500">Add newly prepared or purchased portions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStockInModalOpen(false)}
                className="p-1 rounded text-stone-400 hover:text-stone-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleStockInSubmit} className="p-6 space-y-4">
              {/* Select Dish */}
              <div>
                <label className="text-xs font-semibold text-stone-700 block mb-1">Select Menu Item</label>
                <select
                  value={selectedItem?.menu_item_id || ""}
                  onChange={(e) => {
                    const match = items.find((i) => i.menu_item_id === parseInt(e.target.value));
                    if (match) setSelectedItem(match);
                  }}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-800 focus:outline-none focus:border-[#8B1E1E]"
                  required
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.menu_item_id}>
                      {i.item_name} (Current: {i.quantity} {i.unit_of_measure || "portions"})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <Input
                label={`Quantity to Add (${selectedItem?.unit_of_measure || "portions"})`}
                type="number"
                step="0.01"
                min="0.01"
                placeholder="e.g. 50"
                value={formQuantity}
                onChange={(e) => setFormQuantity(e.target.value)}
                required
              />

              {/* Projected Total */}
              {selectedItem && formQuantity && parseFloat(formQuantity) > 0 && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-lg flex items-center justify-between text-xs text-emerald-900">
                  <span>Projected new stock:</span>
                  <span className="font-bold text-sm">
                    {(selectedItem.quantity + parseFloat(formQuantity)).toFixed(1)}{" "}
                    {selectedItem.unit_of_measure || "portions"}
                  </span>
                </div>
              )}

              {/* Notes */}
              <TextArea
                label="Restock Notes / Batch ID"
                rows={2}
                placeholder="e.g. Morning batch prepared by kitchen, or supplier invoice #8291"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200">
                <Button type="button" variant="outline" size="md" onClick={() => setStockInModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="md" disabled={submitting}>
                  {submitting ? "Adding..." : "Confirm Stock In"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: WASTAGE / SPOILT / DAMAGED */}
      {wastageModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-stone-200 w-full max-w-md shadow-xl overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                  <Trash2 size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">Record Wastage or Damaged</h3>
                  <p className="text-xs text-stone-500">Deduct spoilt food or expired inventory</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWastageModalOpen(false)}
                className="p-1 rounded text-stone-400 hover:text-stone-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleWastageSubmit} className="p-6 space-y-4">
              {/* Select Dish */}
              <div>
                <label className="text-xs font-semibold text-stone-700 block mb-1">Select Menu Item</label>
                <select
                  value={selectedItem?.menu_item_id || ""}
                  onChange={(e) => {
                    const match = items.find((i) => i.menu_item_id === parseInt(e.target.value));
                    if (match) setSelectedItem(match);
                  }}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-800 focus:outline-none focus:border-[#8B1E1E]"
                  required
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.menu_item_id}>
                      {i.item_name} (Available: {i.quantity} {i.unit_of_measure || "portions"})
                    </option>
                  ))}
                </select>
              </div>

              {/* Type Selection */}
              <div>
                <label className="text-xs font-semibold text-stone-700 block mb-1">Wastage Category</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormWastageType("wastage")}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-colors cursor-pointer ${
                      formWastageType === "wastage"
                        ? "bg-amber-50 text-amber-900 border-amber-300 ring-2 ring-amber-300/30"
                        : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100"
                    }`}
                  >
                    Food Waste / Expired
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormWastageType("damaged")}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-colors cursor-pointer ${
                      formWastageType === "damaged"
                        ? "bg-red-50 text-red-900 border-red-300 ring-2 ring-red-300/30"
                        : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100"
                    }`}
                  >
                    Physical Damage / Spilled
                  </button>
                </div>
              </div>

              {/* Quantity */}
              <Input
                label={`Quantity Lost (${selectedItem?.unit_of_measure || "portions"})`}
                type="number"
                step="0.01"
                min="0.01"
                max={selectedItem?.quantity || 9999}
                placeholder="e.g. 3"
                value={formQuantity}
                onChange={(e) => setFormQuantity(e.target.value)}
                required
              />

              {/* Reason */}
              <TextArea
                label="Reason / Audit Note (Required)"
                rows={2}
                placeholder="Explain why this portion was wasted (e.g. dropped on floor, burnt during preparation, expired batch)..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                required
              />

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200">
                <Button type="button" variant="outline" size="md" onClick={() => setWastageModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="md" disabled={submitting}>
                  {submitting ? "Recording..." : "Record Wastage"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: MANUAL ADJUSTMENT / PHYSICAL COUNT */}
      {adjustModalOpen && selectedItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-stone-200 w-full max-w-md shadow-xl overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center">
                  <SlidersHorizontal size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">Physical Stock Count Adjust</h3>
                  <p className="text-xs text-stone-500">{selectedItem.item_name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdjustModalOpen(false)}
                className="p-1 rounded text-stone-400 hover:text-stone-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="p-6 space-y-4">
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg flex items-center justify-between text-xs">
                <span className="text-stone-500">Current System Stock:</span>
                <span className="font-bold text-stone-900 text-sm">
                  {selectedItem.quantity} {selectedItem.unit_of_measure || "portions"}
                </span>
              </div>

              {/* New Quantity */}
              <Input
                label={`Actual Counted Stock (${selectedItem.unit_of_measure || "portions"})`}
                type="number"
                step="0.01"
                min="0"
                placeholder="Enter physical count"
                value={formQuantity}
                onChange={(e) => setFormQuantity(e.target.value)}
                required
              />

              {/* Discrepancy indicator */}
              {formQuantity !== "" && !isNaN(parseFloat(formQuantity)) && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center justify-between border ${
                    parseFloat(formQuantity) - selectedItem.quantity === 0
                      ? "bg-stone-50 border-stone-200 text-stone-700"
                      : parseFloat(formQuantity) - selectedItem.quantity > 0
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : "bg-red-50 border-red-200 text-red-900"
                  }`}
                >
                  <span>Inventory Variance:</span>
                  <span className="font-bold text-sm">
                    {parseFloat(formQuantity) - selectedItem.quantity > 0 ? "+" : ""}
                    {(parseFloat(formQuantity) - selectedItem.quantity).toFixed(1)}{" "}
                    {selectedItem.unit_of_measure || "portions"}
                  </span>
                </div>
              )}

              {/* Low stock threshold */}
              <Input
                label="Low Stock Warning Alert Threshold"
                type="number"
                step="1"
                min="0"
                placeholder="5"
                value={formThreshold}
                onChange={(e) => setFormThreshold(e.target.value)}
              />

              {/* Reason */}
              <TextArea
                label="Reason / Audit Note (Required)"
                rows={2}
                placeholder="e.g. End of day physical stock reconciliation count"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                required
              />

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200">
                <Button type="button" variant="outline" size="md" onClick={() => setAdjustModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="md" disabled={submitting}>
                  {submitting ? "Saving..." : "Save Adjustment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: INDIVIDUAL DISH MOVEMENT HISTORY */}
      {historyModalOpen && selectedItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-stone-200 w-full max-w-2xl shadow-xl overflow-hidden animate-scale-in max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 shrink-0">
              <div className="flex items-center gap-3">
                <img
                  src={resolveMediaUrl(selectedItem.item_image) || "/queen-logo.png"}
                  alt={selectedItem.item_name}
                  className="w-10 h-10 rounded-lg object-cover bg-stone-100 border border-stone-200"
                />
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">{selectedItem.item_name}</h3>
                  <p className="text-xs text-stone-500">
                    Movement ledger • Current stock: {selectedItem.quantity}{" "}
                    {selectedItem.unit_of_measure || "portions"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="p-1 rounded text-stone-400 hover:text-stone-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {loadingItemHistory ? (
                <div className="py-12 text-center text-stone-500">
                  <div className="w-8 h-8 border-3 border-[#8B1E1E] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs font-medium">Loading history...</p>
                </div>
              ) : itemHistory.length === 0 ? (
                <div className="py-12 text-center text-stone-400">
                  <History size={32} className="mx-auto mb-2 text-stone-300" />
                  <p className="text-sm font-medium text-stone-600">No stock movements recorded yet</p>
                </div>
              ) : (
                <div className="relative border-l border-stone-200 ml-4 space-y-4 py-2">
                  {itemHistory.map((h) => {
                    const isPositive = ["stock_in", "add", "order_restore", "initial"].includes(h.movement_type);
                    const isNegative = ["order_deduct", "deduction", "wastage", "damaged"].includes(h.movement_type);

                    return (
                      <div key={h.id} className="relative pl-6">
                        <div
                          className={`absolute -left-2 top-1 w-4 h-4 rounded-full border-2 border-white ${
                            isPositive ? "bg-emerald-500" : isNegative ? "bg-red-500" : "bg-stone-400"
                          }`}
                        />
                        <div className="bg-stone-50 p-3 rounded-lg border border-stone-200">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-semibold text-stone-900 flex items-center gap-1.5">
                              {renderMovementBadge(h.movement_type)}
                              <span className="font-mono font-bold text-sm">
                                {isPositive ? `+${h.quantity}` : isNegative ? `-${h.quantity}` : h.quantity}
                              </span>
                            </span>
                            <span className="text-stone-400 text-[11px]">
                              {format(new Date(h.created_at.replace(/-/g, "/")), "MMM d, h:mm a")}
                            </span>
                          </div>

                          {h.quantity_before !== null && h.quantity_after !== null && (
                            <div className="text-[11px] text-stone-500 mb-1">
                              Stock: {h.quantity_before} → <strong>{h.quantity_after}</strong>
                            </div>
                          )}

                          {h.notes && (
                            <p className="text-xs text-stone-700 bg-white p-1.5 rounded border border-stone-200/60 mt-1">
                              {h.notes}
                            </p>
                          )}

                          <div className="flex items-center justify-between text-[10px] text-stone-400 mt-2">
                            <span>Ref: {h.reference_id || "N/A"}</span>
                            <span>By: {h.created_by_name || "System"}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-stone-200 bg-stone-50 shrink-0 text-right">
              <Button type="button" variant="outline" size="sm" onClick={() => setHistoryModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default InventoryManagement;
