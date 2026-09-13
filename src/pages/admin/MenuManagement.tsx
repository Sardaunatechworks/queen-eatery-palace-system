import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { formatNaira } from "../../utils/format";
import { resolveMediaUrl } from "../../utils/media";
import { useUI } from "../../context/UIContext";
import {
  Plus,
  Trash2,
  UtensilsCrossed,
  X,
  Edit,
  Check,
  XCircle,
  ToggleLeft,
  ToggleRight,
  Package,
  Download,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  Loader2,
  Settings,
  Eye,
  Clock,
  User,
  ChefHat,
  AlertTriangle,
} from "lucide-react";
import { exportMenuToPDF, exportMenuToCSV, exportMenuToExcel } from "../../utils/export";
import { ImageUpload } from "../../components/ImageUpload";
import type { Category, MenuItem } from "../../types";
import {
  getCategories,
  createCategory,
  deleteCategory,
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  approveMenuItem,
} from "../../services/menuService";
import { PageHeader, Badge, ActionDropdown, ActionItem } from "../../components/ui";
import { SearchInput, Input, TextArea, Select } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { getTakeawayPackPrice, updateTakeawayPackPrice } from "../../services/pricingService";

// Re-export for compatibility with other components
export type { Category, MenuItem };

const DEFAULT_CATEGORIES = ["Meals", "Rice Dishes", "Soups", "Drinks", "Snacks", "Desserts"];

export const MenuManagement: React.FC = () => {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"all" | "pending">(
    tabParam === "pending" ? "pending" : "all"
  );

  // Dedicated Kitchen Proposal Review State
  const [reviewItem, setReviewItem] = useState<MenuItem | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewPrice, setReviewPrice] = useState("");
  const [reviewCategory, setReviewCategory] = useState("");
  const [reviewDescription, setReviewDescription] = useState("");
  const [reviewRequiresPackaging, setReviewRequiresPackaging] = useState(true);
  const [rejectConfirmItem, setRejectConfirmItem] = useState<MenuItem | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "pending") {
      setActiveTab("pending");
    }
  }, [searchParams]);

  const [categoryFilter, setCategoryFilter] = useState("All");
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportScope, setExportScope] = useState<"all" | "filtered">("all");
  const [packPriceSetting, setPackPriceSetting] = useState<number>(300);
  const [showPackPriceModal, setShowPackPriceModal] = useState(false);
  const [editingPackPriceInput, setEditingPackPriceInput] = useState("300");
  const [isUpdatingPackPrice, setIsUpdatingPackPrice] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    image: "",
    category_id: "",
    stockQuantity: "0",
    lowStockThreshold: "5",
    status: "available" as "available" | "disabled",
    requires_packaging: true,
    track_inventory: true,
    unit_of_measure: "portion",
  });

  const { setLoading: setGlobalLoading, showToast } = useUI();

  const fetchMenuAndCategories = async () => {
    try {
      const [menuRes, catsRes] = await Promise.all([
        getMenuItems({ per_page: 200 }),
        getCategories(),
      ]);

      // Normalize items for UI and compatibility
      const normalizedItems = (menuRes.items || []).map((item) => ({
        ...item,
        image: resolveMediaUrl(item.image_path || item.image) || "/queen-logo.png",
        category: item.category_name || item.category || "Uncategorized",
        stockQuantity: item.quantity_available ?? item.stockQuantity ?? 0,
        isAvailable: item.status === "available",
      }));

      setMenu(normalizedItems);
      setCategories(catsRes || []);
    } catch (error: any) {
      console.error("Failed to load menu or categories:", error);
      showToast(error.message || "Failed to load menu", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenuAndCategories();
    getTakeawayPackPrice().then((p) => {
      setPackPriceSetting(p);
      setEditingPackPriceInput(p.toString());
    });
  }, []);

  const handleSavePackPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(editingPackPriceInput);
    if (isNaN(num) || num < 0) {
      showToast("Please enter a valid pack price", "error");
      return;
    }
    setIsUpdatingPackPrice(true);
    try {
      const updated = await updateTakeawayPackPrice(num);
      setPackPriceSetting(updated);
      setShowPackPriceModal(false);
      showToast(`Takeaway pack price updated to ${formatNaira(updated)}. Affects new orders only.`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update pack price", "error");
    } finally {
      setIsUpdatingPackPrice(false);
    }
  };

  const handleExportMenu = async (
    format: "pdf" | "csv" | "excel",
    scope: "all" | "filtered" = exportScope
  ) => {
    setIsExporting(true);
    showToast("Preparing menu catalog export with latest data...", "info");
    try {
      let itemsToExport: MenuItem[] = [];

      if (scope === "filtered") {
        itemsToExport = filteredMenu;
      } else {
        // Fetch fresh full menu catalog from server with high limit to ensure latest content
        const res = await getMenuItems({ per_page: 500 });
        itemsToExport = (res.items || []).map((item) => ({
          ...item,
          image: item.image_path || item.image || "",
          category: item.category_name || item.category || "Uncategorized",
          stockQuantity: item.quantity_available ?? item.stockQuantity ?? 0,
          isAvailable: item.status === "available",
        }));
      }

      if (itemsToExport.length === 0) {
        showToast("No menu items available to export", "warning");
        return;
      }

      const categoryName =
        categoryFilter === "All"
          ? "All Categories"
          : categories.find((c) => String(c.id) === categoryFilter)?.name || "Filtered Category";

      const scopeDescription =
        scope === "all"
          ? "Complete Catalog"
          : `Filtered (${activeTab === "all" ? "Approved" : "Pending"}, ${categoryName})`;

      if (format === "pdf") {
        exportMenuToPDF(itemsToExport, {
          scopeName: scopeDescription,
          categoryFilterName: categoryName,
        });
      } else if (format === "csv") {
        exportMenuToCSV(
          itemsToExport,
          `Queens_Palace_Menu_${scope === "all" ? "Full_Catalog" : "Filtered"}`
        );
      } else if (format === "excel") {
        exportMenuToExcel(
          itemsToExport,
          `Queens_Palace_Menu_${scope === "all" ? "Full_Catalog" : "Filtered"}`
        );
      }

      showToast(
        `Exported ${itemsToExport.length} menu items successfully as ${format.toUpperCase()}`,
        "success"
      );
      setShowExportModal(false);
    } catch (err: any) {
      console.error("Menu export failed:", err);
      showToast(err.message || "Failed to export menu", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const activeCategories = useMemo(() => {
    return categories.length > 0 ? categories : [];
  }, [categories]);

  const filteredMenu = useMemo(() => {
    return menu.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()));

      let matchesCategory = true;
      if (categoryFilter !== "All") {
        matchesCategory = String(item.category_id) === categoryFilter;
      }

      const matchesTab =
        activeTab === "all"
          ? item.approval_status === "approved"
          : item.approval_status === "pending";

      return matchesSearch && matchesCategory && matchesTab;
    });
  }, [menu, searchTerm, categoryFilter, activeTab]);

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({
      name: "",
      description: "",
      price: "",
      image: "",
      category_id: activeCategories[0] ? String(activeCategories[0].id) : "",
      stockQuantity: "0",
      lowStockThreshold: "5",
      status: "available",
      requires_packaging: true,
      track_inventory: true,
      unit_of_measure: "portion",
    });
  };

  const handleEditClick = (item: MenuItem) => {
    setEditingId(item.id);
    setFormData({
      name: item.name,
      description: item.description || "",
      price: item.price.toString(),
      image: item.image_path || item.image || "",
      category_id: item.category_id ? String(item.category_id) : "",
      stockQuantity: (item.quantity_available ?? item.stockQuantity ?? 0).toString(),
      lowStockThreshold: (item.low_stock_threshold ?? 5).toString(),
      status: item.status === "disabled" ? "disabled" : "available",
      requires_packaging: item.requires_packaging !== false,
      track_inventory: item.track_inventory !== false,
      unit_of_measure: item.unit_of_measure || "portion",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalLoading(true);
    try {
      const parsedCatId = formData.category_id ? Number(formData.category_id) : null;
      const parsedPrice = Number(formData.price);
      const parsedStock = Number(formData.stockQuantity) || 0;
      const parsedThreshold = Number(formData.lowStockThreshold) || 5;

      if (editingId) {
        await updateMenuItem(editingId, {
          name: formData.name,
          description: formData.description || undefined,
          price: parsedPrice,
          category_id: parsedCatId,
          image_path: formData.image || undefined,
          quantity_available: parsedStock,
          low_stock_threshold: parsedThreshold,
          track_inventory: formData.track_inventory,
          unit_of_measure: formData.unit_of_measure,
          status: formData.status,
          requires_packaging: formData.requires_packaging,
        });
        showToast("Menu item updated successfully", "success");
      } else {
        await createMenuItem({
          name: formData.name,
          description: formData.description || undefined,
          price: parsedPrice,
          category_id: parsedCatId,
          image_path: formData.image || undefined,
          quantity_available: parsedStock,
          low_stock_threshold: parsedThreshold,
          track_inventory: formData.track_inventory,
          unit_of_measure: formData.unit_of_measure,
          requires_packaging: formData.requires_packaging,
        });
        showToast("Menu item added successfully", "success");
      }
      await fetchMenuAndCategories();
      closeModal();
    } catch (error: any) {
      showToast(
        error.message || (editingId ? "Failed to update item" : "Failed to add menu item"),
        "error"
      );
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      setGlobalLoading(true);
      try {
        await deleteMenuItem(id);
        showToast("Item deleted successfully", "success");
        await fetchMenuAndCategories();
      } catch (error: any) {
        showToast(error.message || "Failed to delete item", "error");
      } finally {
        setGlobalLoading(false);
      }
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    setGlobalLoading(true);
    try {
      await createCategory({
        name: newCategoryName.trim(),
      });
      setNewCategoryName("");
      setShowCategoryInput(false);
      showToast("Category added successfully", "success");
      await fetchMenuAndCategories();
    } catch (error: any) {
      showToast(error.message || "Failed to add category", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleDeleteCategory = async (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete category "${name}"?`)) {
      setGlobalLoading(true);
      try {
        await deleteCategory(id);
        showToast("Category deleted successfully", "success");
        await fetchMenuAndCategories();
      } catch (error: any) {
        showToast(error.message || "Failed to delete category", "error");
      } finally {
        setGlobalLoading(false);
      }
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    try {
      const nextStatus = item.status === "available" ? "disabled" : "available";
      await updateMenuItem(item.id, {
        status: nextStatus,
      });
      showToast(`"${item.name}" availability updated`, "success");
      await fetchMenuAndCategories();
    } catch (e: any) {
      showToast(e.message || "Failed to update availability", "error");
    }
  };

  const handleApproveReject = async (id: number, name: string, status: "approved" | "rejected") => {
    setGlobalLoading(true);
    try {
      await approveMenuItem(id, status);
      showToast(`"${name}" has been ${status}`, "success");
      await fetchMenuAndCategories();
    } catch (error: any) {
      showToast(error.message || "Approval update failed", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleOpenReview = (item: MenuItem) => {
    setReviewItem(item);
    setReviewPrice(String(item.price));
    setReviewCategory(item.category_id ? String(item.category_id) : "");
    setReviewDescription(item.description || "");
    setReviewRequiresPackaging(item.requires_packaging !== false);
    setShowReviewModal(true);
  };

  const handleSaveAndApprove = async () => {
    if (!reviewItem) return;
    setIsProcessingAction(true);
    try {
      const priceVal = parseFloat(reviewPrice);
      if (isNaN(priceVal) || priceVal < 0) {
        showToast("Please enter a valid price", "warning");
        setIsProcessingAction(false);
        return;
      }

      // If price, category, description, or packaging changed, update item first
      const hasChanges =
        priceVal !== reviewItem.price ||
        (reviewCategory && reviewCategory !== String(reviewItem.category_id)) ||
        reviewDescription !== (reviewItem.description || "") ||
        reviewRequiresPackaging !== (reviewItem.requires_packaging !== false);

      if (hasChanges) {
        await updateMenuItem(reviewItem.id, {
          price: priceVal,
          category_id: reviewCategory ? parseInt(reviewCategory) : undefined,
          description: reviewDescription,
          requires_packaging: reviewRequiresPackaging,
        });
      }

      await approveMenuItem(reviewItem.id, "approved");
      showToast(`"${reviewItem.name}" approved and published to live menu!`, "success");
      setShowReviewModal(false);
      setReviewItem(null);
      await fetchMenuAndCategories();
    } catch (err: any) {
      showToast(err.message || "Failed to approve item", "error");
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectConfirmItem) return;
    setIsProcessingAction(true);
    try {
      await approveMenuItem(rejectConfirmItem.id, "rejected");
      showToast(`"${rejectConfirmItem.name}" proposal has been rejected`, "info");
      setRejectConfirmItem(null);
      if (reviewItem?.id === rejectConfirmItem.id) {
        setShowReviewModal(false);
        setReviewItem(null);
      }
      await fetchMenuAndCategories();
    } catch (err: any) {
      showToast(err.message || "Failed to reject proposal", "error");
    } finally {
      setIsProcessingAction(false);
    }
  };

  const pendingCount = useMemo(() => {
    return menu.filter((m) => m.approval_status === "pending").length;
  }, [menu]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Menu Management"
        description="Manage your restaurant catalog, pricing, real-time inventory, and item status."
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="md"
              icon={<Package size={16} className="text-[#8B1E1E]" />}
              onClick={() => {
                setEditingPackPriceInput(packPriceSetting.toString());
                setShowPackPriceModal(true);
              }}
            >
              Pack Price: {formatNaira(packPriceSetting)}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="md"
              disabled={isExporting}
              icon={
                isExporting ? (
                  <Loader2 size={16} className="animate-spin text-stone-600" />
                ) : (
                  <Download size={16} className="text-stone-600" />
                )
              }
              onClick={() => setShowExportModal(true)}
            >
              Export Menu
            </Button>

            <Button
              variant="primary"
              size="md"
              icon={<Plus size={16} />}
              onClick={() => setShowModal(true)}
            >
              Add Menu Item
            </Button>
          </div>
        }
      />

      {/* Pending Proposals Review Alert Banner */}
      {pendingCount > 0 && activeTab !== "pending" && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/90 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-800 flex items-center justify-center shrink-0">
              <ChefHat size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-stone-900">
                  {pendingCount} Menu Proposal{pendingCount > 1 ? "s" : ""} Awaiting Review
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold tracking-wide uppercase">
                  From Kitchen Staff
                </span>
              </div>
              <p className="text-xs text-stone-600 mt-0.5">
                Kitchen staff have submitted new dish proposals that require administrator review before appearing on the customer menu and POS.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 border-amber-700 text-white shrink-0 self-start sm:self-auto shadow-xs"
            onClick={() => setActiveTab("pending")}
          >
            Review Proposals Now ({pendingCount})
          </Button>
        </div>
      )}

      {/* Controls Bar: Search, Category Filter, Approval Tabs */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="w-full sm:w-72">
            <SearchInput
              placeholder="Search by name or ingredients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClear={() => setSearchTerm("")}
            />
          </div>

          <div className="w-full sm:w-48">
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={[
                { value: "All", label: "All Categories" },
                ...activeCategories.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
            />
          </div>
        </div>

        {/* Tab switch */}
        <div className="inline-flex p-0.5 rounded-lg bg-stone-100 border border-stone-200 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "all"
                ? "bg-white text-stone-900 shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Approved Items ({menu.filter((m) => m.approval_status === "approved").length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === "pending"
                ? "bg-white text-stone-900 shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Pending Review
            {pendingCount > 0 && (
              <span className="h-4 px-1.5 rounded-full bg-amber-100 text-amber-900 font-semibold text-[10px] inline-flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Category Management Bar */}
      <div className="bg-white p-3 rounded-lg border border-stone-200 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-stone-500 mr-2">
          Categories:
        </span>
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="inline-flex items-center gap-1 bg-stone-50 border border-stone-200 px-2.5 py-1 rounded-md text-xs font-medium text-stone-700"
          >
            <span>{cat.name}</span>
            <button
              type="button"
              onClick={() => handleDeleteCategory(cat.id, cat.name)}
              className="text-stone-400 hover:text-red-600 ml-0.5 p-0.5 rounded transition-colors"
              title={`Delete ${cat.name}`}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {categories.length === 0 &&
          DEFAULT_CATEGORIES.map((cat) => (
            <div
              key={cat}
              className="inline-flex items-center bg-stone-50 border border-stone-200 px-2.5 py-1 rounded-md text-xs font-medium text-stone-500"
            >
              {cat}
            </div>
          ))}

        {showCategoryInput ? (
          <div className="inline-flex items-center gap-1 bg-white border border-stone-300 rounded-md p-0.5">
            <input
              type="text"
              placeholder="Category name..."
              className="px-2 py-0.5 text-xs text-stone-900 outline-none w-32"
              value={newCategoryName}
              onChange={(e) => {
                const val = e.target.value.replace(/[^a-zA-Z0-9\s\-&]/g, "");
                setNewCategoryName(val);
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCategory();
                } else if (e.key === "Escape") {
                  setShowCategoryInput(false);
                }
              }}
            />
            <button
              type="button"
              onClick={handleAddCategory}
              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
              title="Save"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={() => setShowCategoryInput(false)}
              className="p-1 text-stone-400 hover:bg-stone-100 rounded"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCategoryInput(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 border border-dashed border-stone-300 rounded-md text-xs font-medium text-stone-600 hover:text-stone-900 hover:border-stone-400 transition-colors"
          >
            <Plus size={12} /> New Category
          </button>
        )}
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center bg-white rounded-lg border border-stone-200">
          <div className="w-7 h-7 border-2 border-[#8B1E1E] border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-xs text-stone-500 font-medium">Loading menu catalog...</p>
        </div>
      ) : filteredMenu.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center bg-white rounded-lg border border-dashed border-stone-300 text-center px-4">
          <UtensilsCrossed className="text-stone-300 mb-2" size={36} />
          <p className="text-sm font-medium text-stone-700">No menu items found</p>
          <p className="text-xs text-stone-400 mt-0.5 max-w-sm">
            Try adjusting your search query or category filters, or add a new menu item.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-stone-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-stone-500 font-medium">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-3 w-16">Item</th>
                  <th className="py-3 px-4">Name & Details</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Price</th>
                  <th className="py-3 px-4 text-center">Stock</th>
                  {activeTab === "pending" ? (
                    <th className="py-3 px-4 text-left">Proposed By</th>
                  ) : (
                    <th className="py-3 px-4 text-center">Status</th>
                  )}
                  <th className="py-3 px-4 text-right w-16">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-700">
                {filteredMenu.map((item, idx) => {
                  const stock = item.quantity_available ?? item.stockQuantity ?? 0;
                  const threshold = item.low_stock_threshold ?? 5;
                  const isLowStock = stock > 0 && stock <= threshold;
                  const isOutOfStock = stock <= 0;
                  const itemImage =
                    resolveMediaUrl(item.image_path || item.image) || "/queen-logo.png";
                  const catName = item.category_name || item.category || "Uncategorized";

                  // Contextual dropdown actions for approved items
                  const actions: ActionItem[] = [
                    {
                      label: "Edit Details",
                      icon: <Edit size={14} />,
                      onClick: () => handleEditClick(item),
                    },
                    {
                      label: item.status === "available" ? "Mark Unavailable" : "Mark Available",
                      icon:
                        item.status === "available" ? (
                          <ToggleLeft size={14} />
                        ) : (
                          <ToggleRight size={14} />
                        ),
                      onClick: () => toggleAvailability(item),
                    },
                    {
                      label: "Delete Item",
                      icon: <Trash2 size={14} />,
                      danger: true,
                      onClick: () => handleDelete(item.id, item.name),
                    },
                  ];

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-stone-50 transition-colors h-14"
                    >
                      <td className="py-2.5 px-4 text-center text-stone-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <img
                          src={itemImage}
                          alt={item.name}
                          className="w-10 h-10 rounded-md object-cover border border-stone-200 bg-stone-100"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            if (!target.src.endsWith("/queen-logo.png")) {
                              target.src = "/queen-logo.png";
                            }
                          }}
                        />
                      </td>
                      <td className="py-2.5 px-4 max-w-xs">
                        <div className="font-medium text-stone-900 truncate">{item.name}</div>
                        {item.description && (
                          <div className="text-[11px] text-stone-500 truncate mt-0.5">
                            {item.description}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="text-stone-600">{catName}</span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium text-stone-900">
                        {formatNaira(item.price)}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <Badge
                          size="sm"
                          variant={
                            isOutOfStock
                              ? "error"
                              : isLowStock
                              ? "warning"
                              : "success"
                          }
                        >
                          {isOutOfStock ? "Out of Stock" : `${stock} units`}
                        </Badge>
                      </td>
                      {activeTab === "pending" ? (
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-1.5 font-medium text-stone-800">
                            <User size={13} className="text-stone-400 shrink-0" />
                            <span className="truncate">{item.creator_name || "Kitchen Staff"}</span>
                          </div>
                          {item.created_at && (
                            <div className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5">
                              <Clock size={11} className="text-stone-400" />
                              <span>
                                {format(
                                  new Date(item.created_at.replace(/-/g, "/")),
                                  "MMM d, h:mm a"
                                )}
                              </span>
                            </div>
                          )}
                        </td>
                      ) : (
                        <td className="py-2.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => toggleAvailability(item)}
                            className="group inline-flex items-center cursor-pointer"
                            title="Click to toggle availability"
                          >
                            <Badge
                              size="sm"
                              variant={item.status === "available" ? "success" : "neutral"}
                              className="group-hover:border-stone-400 transition-colors"
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                                  item.status === "available" ? "bg-emerald-500" : "bg-stone-400"
                                }`}
                              />
                              {item.status === "available" ? "Active" : "Disabled"}
                            </Badge>
                          </button>
                        </td>
                      )}
                      <td className="py-2.5 px-4 text-right">
                        {activeTab === "pending" ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-stone-700 hover:text-stone-900 border-stone-200 hover:border-stone-300"
                              icon={<Eye size={13} className="text-stone-500" />}
                              onClick={() => handleOpenReview(item)}
                            >
                              Review
                            </Button>
                            <button
                              type="button"
                              onClick={() => handleApproveReject(item.id, item.name, "approved")}
                              className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                              title="Accept and publish to live menu"
                            >
                              <Check size={13} />
                              <span>Accept</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectConfirmItem(item)}
                              className="h-8 px-2.5 rounded-lg border border-stone-200 hover:border-red-200 text-stone-600 hover:text-red-600 hover:bg-red-50 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                              title="Reject proposal"
                            >
                              <XCircle size={13} />
                              <span>Reject</span>
                            </button>
                          </div>
                        ) : (
                          <ActionDropdown items={actions} align="right" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-stone-200 w-full max-w-lg shadow-xl overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
              <div>
                <h2 className="text-base font-semibold text-stone-900">
                  {editingId ? "Edit Menu Item" : "Add New Menu Item"}
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Fill in dish details, pricing, and initial stock level.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <Input
                label="Item Name"
                placeholder="e.g. Traditional Jollof Rice with Grilled Chicken"
                required
                value={formData.name}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^a-zA-Z0-9\s\-&,.'()]/g, "");
                  setFormData({ ...formData, name: val });
                }}
              />

              <TextArea
                label="Description"
                placeholder="Fragrant long-grain rice infused with ripe plum tomatoes, roasted bell peppers, and spices..."
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Price (₦)"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  required
                  value={formData.price}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, "");
                    setFormData({ ...formData, price: val });
                  }}
                />

                <Input
                  label="Stock Available"
                  type="number"
                  placeholder="0"
                  required
                  value={formData.stockQuantity}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, "");
                    setFormData({ ...formData, stockQuantity: val });
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Category"
                  required
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  options={[
                    { value: "", label: "Select a Category" },
                    ...activeCategories.map((cat) => ({
                      value: String(cat.id),
                      label: cat.name,
                    })),
                  ]}
                />

                <Input
                  label="Low Stock Warning at"
                  type="number"
                  placeholder="5"
                  value={formData.lowStockThreshold}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, "");
                    setFormData({ ...formData, lowStockThreshold: val });
                  }}
                />
              </div>

              {/* Track Inventory & Unit of Measure */}
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg space-y-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="track_inventory"
                    checked={formData.track_inventory}
                    onChange={(e) => setFormData({ ...formData, track_inventory: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-stone-300 text-[#8B1E1E] focus:ring-[#8B1E1E] cursor-pointer"
                  />
                  <label htmlFor="track_inventory" className="text-xs cursor-pointer select-none">
                    <span className="font-semibold text-stone-900 block">
                      Track Real-Time Stock Availability
                    </span>
                    <span className="text-stone-500 text-[11px] block mt-0.5 leading-relaxed">
                      Automatically deduct portions on order placement and block sales when out of stock. Uncheck for made-to-order unlimited items.
                    </span>
                  </label>
                </div>

                {formData.track_inventory && (
                  <div className="pt-2 border-t border-stone-200/80">
                    <Select
                      label="Unit of Measure"
                      value={formData.unit_of_measure}
                      onChange={(e) => setFormData({ ...formData, unit_of_measure: e.target.value })}
                      options={[
                        { value: "portion", label: "Portion (plates / servings)" },
                        { value: "bottle", label: "Bottle (drinks / wine)" },
                        { value: "can", label: "Can (canned beverages)" },
                        { value: "piece", label: "Piece (pastries / meats)" },
                        { value: "pack", label: "Pack (takeaway sets)" },
                        { value: "cup", label: "Cup (beverages / ice cream)" },
                        { value: "kg", label: "Kg (bulk weights)" },
                      ]}
                    />
                  </div>
                )}
              </div>

              {/* Requires Takeaway Packaging Checkbox */}
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg flex items-start gap-3">
                <input
                  type="checkbox"
                  id="requires_packaging"
                  checked={formData.requires_packaging}
                  onChange={(e) => setFormData({ ...formData, requires_packaging: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-stone-300 text-[#8B1E1E] focus:ring-[#8B1E1E] cursor-pointer"
                />
                <label htmlFor="requires_packaging" className="text-xs cursor-pointer select-none">
                  <span className="font-semibold text-stone-900 block flex items-center gap-1.5">
                    <Package size={13} className="text-[#8B1E1E]" />
                    Requires Takeaway Packaging
                  </span>
                  <span className="text-stone-500 text-[11px] block mt-0.5 leading-relaxed">
                    Check for meals, soups, and dishes needing disposable takeaway packaging containers ({formatNaira(packPriceSetting)}/pack). Uncheck for drinks, bottled water, or canned beverages.
                  </span>
                </label>
              </div>

              <div>
                <label className="text-xs font-medium text-stone-700 select-none block mb-1.5">
                  Item Photograph
                </label>
                <ImageUpload
                  initialImage={formData.image}
                  onUploadComplete={(url) => setFormData({ ...formData, image: url })}
                  folder="menu"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-stone-200">
                <Button type="button" variant="outline" size="md" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="md">
                  {editingId ? "Save Changes" : "Create Item"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Export Menu Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-stone-100 text-[#8B1E1E] rounded-lg border border-stone-200">
                  <Download size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">Export Menu Catalog</h3>
                  <p className="text-xs text-stone-500">Download formatted restaurant catalog & inventory data</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Scope Selection */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">
                  Select Export Scope
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setExportScope("all")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      exportScope === "all"
                        ? "border-[#8B1E1E] bg-red-50/50 text-[#8B1E1E] shadow-2xs font-semibold"
                        : "border-stone-200 hover:border-stone-300 text-stone-700 bg-white"
                    }`}
                  >
                    <div className="text-xs font-bold">All Menu Items</div>
                    <div className="text-[11px] text-stone-500 mt-0.5">
                      Full catalog ({menu.length} total items in system)
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportScope("filtered")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      exportScope === "filtered"
                        ? "border-[#8B1E1E] bg-red-50/50 text-[#8B1E1E] shadow-2xs font-semibold"
                        : "border-stone-200 hover:border-stone-300 text-stone-700 bg-white"
                    }`}
                  >
                    <div className="text-xs font-bold">Filtered View</div>
                    <div className="text-[11px] text-stone-500 mt-0.5">
                      Current search & category ({filteredMenu.length} items)
                    </div>
                  </button>
                </div>
              </div>

              {/* Format Selection Cards */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">
                  Choose Export Format
                </label>
                <div className="space-y-2.5">
                  {/* PDF Card */}
                  <div
                    onClick={() => !isExporting && handleExportMenu("pdf", exportScope)}
                    className="flex items-center justify-between p-3.5 border border-stone-200 hover:border-red-300 hover:bg-red-50/30 rounded-xl cursor-pointer transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100 group-hover:scale-105 transition-transform">
                        <FileText size={20} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-stone-900 group-hover:text-red-700 transition-colors">
                          PDF Document (.pdf)
                        </h4>
                        <p className="text-[11px] text-stone-500">
                          Landscape orientation, royal header branding, summary statistics & formatted currency
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isExporting}
                      className="shrink-0 group-hover:bg-red-600 group-hover:text-white group-hover:border-red-600"
                    >
                      Export PDF
                    </Button>
                  </div>

                  {/* CSV Card */}
                  <div
                    onClick={() => !isExporting && handleExportMenu("csv", exportScope)}
                    className="flex items-center justify-between p-3.5 border border-stone-200 hover:border-blue-300 hover:bg-blue-50/30 rounded-xl cursor-pointer transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100 group-hover:scale-105 transition-transform">
                        <Download size={20} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-stone-900 group-hover:text-blue-700 transition-colors">
                          CSV Spreadsheet (.csv)
                        </h4>
                        <p className="text-[11px] text-stone-500">
                          Universal comma-separated file with UTF-8 BOM, ideal for Microsoft Excel & Google Sheets
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isExporting}
                      className="shrink-0 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600"
                    >
                      Export CSV
                    </Button>
                  </div>

                  {/* Excel Card */}
                  <div
                    onClick={() => !isExporting && handleExportMenu("excel", exportScope)}
                    className="flex items-center justify-between p-3.5 border border-stone-200 hover:border-emerald-300 hover:bg-emerald-50/30 rounded-xl cursor-pointer transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100 group-hover:scale-105 transition-transform">
                        <FileSpreadsheet size={20} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-stone-900 group-hover:text-emerald-700 transition-colors">
                          Excel Workbook (.xlsx)
                        </h4>
                        <p className="text-[11px] text-stone-500">
                          Native formatted Excel spreadsheet with auto-fitted column widths
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isExporting}
                      className="shrink-0 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600"
                    >
                      Export Excel
                    </Button>
                  </div>
                </div>
              </div>

              {isExporting && (
                <div className="flex items-center justify-center gap-2 p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-600 font-medium">
                  <Loader2 size={16} className="animate-spin text-[#8B1E1E]" />
                  <span>Fetching latest menu data and generating document...</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-stone-200 bg-stone-50 text-xs text-stone-500">
              <span>Exports latest data with accurate real-time inventory</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowExportModal(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Takeaway Pack Price Configuration Modal */}
      {showPackPriceModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-red-50 text-[#8B1E1E] rounded-lg border border-red-100">
                  <Package size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">Takeaway Pack Price</h3>
                  <p className="text-xs text-stone-500">Configure global takeaway container unit charge</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPackPriceModal(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSavePackPrice} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
                  Unit Price per Pack (₦)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="300.00"
                  value={editingPackPriceInput}
                  onChange={(e) => setEditingPackPriceInput(e.target.value)}
                />
              </div>

              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <Settings size={13} />
                  System Business Rule Notice:
                </p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Changing this setting affects <strong>NEW orders only</strong>. It will never alter historical orders. Existing orders permanently retain their stored packaging snapshot (quantity, unit price, and fee).
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setShowPackPriceModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={isUpdatingPackPrice}
                  disabled={isUpdatingPackPrice}
                >
                  Save Pack Price
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Kitchen Proposal Modal */}
      {showReviewModal && reviewItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-stone-200 w-full max-w-xl shadow-2xl overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-800 flex items-center justify-center">
                  <ChefHat size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900 leading-tight">
                    Review Kitchen Proposal
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Proposed by <span className="font-semibold text-stone-700">{reviewItem.creator_name || "Kitchen Staff"}</span>
                    {reviewItem.created_at &&
                      ` · ${format(
                        new Date(reviewItem.created_at.replace(/-/g, "/")),
                        "MMM d, h:mm a"
                      )}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowReviewModal(false);
                  setReviewItem(null);
                }}
                className="text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Dish Visual & Overview */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-xl bg-stone-50 border border-stone-200/80">
                  <img
                    src={resolveMediaUrl(reviewItem.image_path || reviewItem.image)}
                    alt={reviewItem.name}
                    className="w-16 h-16 rounded-xl object-cover border border-stone-200 shrink-0"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      if (!target.src.endsWith("/queen-logo.png")) {
                        target.src = "/queen-logo.png";
                      }
                    }}
                  />
                <div className="flex-1 text-center sm:text-left space-y-1.5 w-full">
                  <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-semibold">
                      Pending Admin Review
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-stone-200/80 text-stone-700 text-xs font-medium">
                      {reviewItem.category_name || "Uncategorized"}
                    </span>
                  </div>
                  <h4 className="text-lg font-bold text-stone-900">{reviewItem.name}</h4>
                  <div className="flex items-center justify-center sm:justify-start gap-4 text-xs text-stone-600">
                    <div>
                      Initial Stock:{" "}
                      <strong className="text-stone-900 font-semibold">
                        {reviewItem.quantity_available} units
                      </strong>
                    </div>
                    <div>
                      Packaging:{" "}
                      <strong className="text-stone-900 font-semibold">
                        {reviewItem.requires_packaging !== false ? "Required" : "None"}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Kitchen Description / Preparation Notes */}
              {reviewItem.description && (
                <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/70">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 mb-1">
                    <FileText size={13} />
                    <span>Kitchen Staff Notes / Description</span>
                  </div>
                  <p className="text-xs text-stone-700 italic leading-relaxed">
                    "{reviewItem.description}"
                  </p>
                </div>
              )}

              {/* Administrator Adjustments */}
              <div className="space-y-3 pt-1 border-t border-stone-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    Adjust Details Before Publishing (Optional)
                  </label>
                  <span className="text-[11px] text-stone-400">Modify if needed</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-stone-700 block mb-1">
                      Selling Price (₦)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={reviewPrice}
                      onChange={(e) => setReviewPrice(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-stone-700 block mb-1">
                      Category
                    </label>
                    <Select
                      value={reviewCategory}
                      onChange={(e) => setReviewCategory(e.target.value)}
                      options={[
                        { value: "", label: "Select Category" },
                        ...activeCategories.map((c) => ({ value: String(c.id), label: c.name })),
                      ]}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-stone-700 block mb-1">
                    Customer Menu Description
                  </label>
                  <TextArea
                    rows={2}
                    placeholder="Short appealing description for customers..."
                    value={reviewDescription}
                    onChange={(e) => setReviewDescription(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="text-xs font-medium text-stone-700 flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={reviewRequiresPackaging}
                      onChange={(e) => setReviewRequiresPackaging(e.target.checked)}
                      className="rounded border-stone-300 text-[#8B1E1E] focus:ring-[#8B1E1E]"
                    />
                    <span>Requires Takeaway Packaging (+{formatNaira(packPriceSetting)})</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-stone-50 border-t border-stone-200 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="md"
                disabled={isProcessingAction}
                className="w-full sm:w-auto text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 hover:bg-red-50"
                icon={<XCircle size={15} />}
                onClick={() => setRejectConfirmItem(reviewItem)}
              >
                Reject Proposal
              </Button>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  disabled={isProcessingAction}
                  onClick={() => {
                    setShowReviewModal(false);
                    setReviewItem(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  disabled={isProcessingAction}
                  className="bg-emerald-600 hover:bg-emerald-700 border-emerald-700 text-white shadow-xs"
                  icon={
                    isProcessingAction ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Check size={16} />
                    )
                  }
                  onClick={handleSaveAndApprove}
                >
                  {isProcessingAction ? "Approving..." : "Approve & Publish to Menu"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirmation Dialog */}
      {rejectConfirmItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-stone-200 w-full max-w-md shadow-2xl p-6 space-y-4 animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Reject Menu Proposal?
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Are you sure you want to reject{" "}
                  <strong className="text-stone-800">"{rejectConfirmItem.name}"</strong>?
                </p>
              </div>
            </div>

            <p className="text-xs text-stone-600 bg-stone-50 p-3 rounded-lg border border-stone-200 leading-relaxed">
              This dish proposal will not be published to the live customer menu or cashier terminal. The kitchen staff member who submitted it will be notified.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                size="md"
                disabled={isProcessingAction}
                onClick={() => setRejectConfirmItem(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="md"
                disabled={isProcessingAction}
                icon={
                  isProcessingAction ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )
                }
                onClick={handleConfirmReject}
              >
                {isProcessingAction ? "Rejecting..." : "Confirm Rejection"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
