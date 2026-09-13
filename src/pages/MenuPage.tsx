import React, { useState, useEffect, useMemo } from "react";
import { apiClient } from "../services/apiClient";
import { Link } from "react-router-dom";
import { Plus, Utensils, ArrowLeft } from "lucide-react";
import { MenuItem } from "./admin/MenuManagement";
import { formatNaira } from "../utils/format";
import queenLogo from "../assets/queen-logo.png";
import { SearchInput } from "../components/ui/Input";
import { Badge } from "../components/ui";
import { Button } from "../components/ui/Button";

export const MenuPage: React.FC = () => {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const categories = useMemo(() => {
    const rawCategories = menu
      .map((item) =>
        typeof item.category_name === "string" && item.category_name.trim()
          ? item.category_name.trim()
          : typeof item.category === "string" && item.category.trim()
          ? item.category.trim()
          : ""
      )
      .filter((cat): cat is string => cat.length > 0);
    const cats = Array.from(new Set(rawCategories));
    return ["All", ...cats];
  }, [menu]);

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const response = await apiClient.get("/menu");
        if (response.success && response.data) {
          setMenu(response.data);
        }
      } catch (error) {
        console.error("Failed to fetch menu:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchMenu();
  }, []);

  const filteredMenu = useMemo(() => {
    return menu.filter((item) => {
      const itemCategory = item.category_name || item.category || "";
      const matchesCategory = categoryFilter === "All" || itemCategory === categoryFilter;
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [menu, categoryFilter, searchTerm]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-7 h-7 border-2 border-[#8B1E1E] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-stone-200 px-6 py-3 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-stone-600 hover:text-stone-900 transition-colors text-xs font-medium"
          >
            <ArrowLeft size={16} />
            <span>Back to Home</span>
          </Link>

          <Link to="/" className="flex items-center gap-2.5">
            <img src={queenLogo} alt="Queen's Palace" className="w-8 h-8 object-contain" />
            <div className="flex flex-col text-left">
              <span className="font-semibold text-sm tracking-tight text-stone-900 leading-none">
                Queen's Palace
              </span>
              <span className="text-[10px] font-medium text-[#D4AF37] tracking-wider mt-0.5">
                Our Menu
              </span>
            </div>
          </Link>

          <Link to="/login">
            <Button variant="primary" size="sm">
              Sign In to Order
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        {/* Title */}
        <div className="text-center max-w-lg mx-auto space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#8B1E1E]">
            Culinary Offerings
          </span>
          <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 tracking-tight">
            Queen's Palace Menu
          </h1>
          <p className="text-xs text-stone-500">
            Freshly cooked northern delicacies, rich soups, rice dishes, snacks, and chilled drinks.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="w-full sm:w-72">
            <SearchInput
              placeholder="Search delicacies..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClear={() => setSearchTerm("")}
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {categories.map((cat, idx) => (
              <button
                key={`cat-${cat}-${idx}`}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                  categoryFilter === cat
                    ? "bg-stone-900 text-white border-stone-900"
                    : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {filteredMenu.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-stone-300 rounded-lg bg-white p-8">
            <Utensils size={40} className="mx-auto text-stone-300 mb-2" />
            <p className="font-medium text-stone-700 text-sm">
              {menu.length === 0
                ? "Our kitchen is preparing the fresh daily menu. Please check back shortly!"
                : "No dishes found"}
            </p>
            <p className="text-xs text-stone-400 mt-0.5">
              {menu.length === 0
                ? "For inquiries and pre-orders, contact us on WhatsApp"
                : "Try searching with a different term or category"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredMenu.map((item, idx) => (
              <div
                key={item.id ? `menu-${item.id}` : `dish-${idx}`}
                className="bg-white rounded-lg border border-stone-200 overflow-hidden shadow-xs hover:border-stone-300 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="relative h-44 bg-stone-100 overflow-hidden">
                    <img
                      src={item.image_path || item.image || "/queen-logo.png"}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-2.5 right-2.5">
                      <Badge variant="neutral" size="sm">
                        {item.category_name || item.category || "Meal"}
                      </Badge>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-stone-900 text-sm line-clamp-1 mb-1">
                      {item.name}
                    </h3>
                    <p className="text-xs font-semibold text-stone-900">{formatNaira(item.price)}</p>
                  </div>
                </div>
                <div className="p-4 pt-0">
                  <Link to="/login" className="block w-full">
                    <Button variant="outline" size="sm" fullWidth icon={<Plus size={14} />}>
                      Order Dish
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
