import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Utensils,
  ArrowRight,
  MapPin,
  Phone,
  MessageSquare,
  Calendar,
  Menu,
  X,
  Loader2,
  CheckCircle2,
  Sparkles,
  Clock,
  ShieldCheck,
  AlertCircle,
  Info,
  Check,
} from "lucide-react";
import * as Icons from "lucide-react";
import { getCMSContent, CMSData } from "../services/cmsService";
import { motion } from "framer-motion";
import { apiClient } from "../lib/apiClient";
import { formatNaira } from "../utils/format";
import { resolveMediaUrl } from "../utils/media";
import { MenuItem } from "./admin/MenuManagement";
import { submitEventHallInquiry, getEventHallAvailability } from "../services/eventHallService";
import type { PaginatedResponse, EventHallAvailabilityResponse, EventHallAvailabilitySlot } from "../types";
import queenLogo from "../assets/queen-logo.png";
import { Input, Select, TextArea } from "../components/ui/Input";
import { Button } from "../components/ui/Button";

export const Landing: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [cmsData, setCmsData] = useState<CMSData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [featuredMenu, setFeaturedMenu] = useState<MenuItem[]>([]);

  // Booking Modal State (no pre-filled dummy data)
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isSubmittingInquiry, setIsSubmittingInquiry] = useState(false);
  const [inquirySubmitted, setInquirySubmitted] = useState(false);
  const [inquiryError, setInquiryError] = useState("");
  const [bookingForm, setBookingForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    event_type: "",
    preferred_date: "",
    start_time: "",
    end_time: "",
    expected_guests: "",
    message: "",
  });

  // Slot availability state
  const [availability, setAvailability] = useState<EventHallAvailabilityResponse | null>(null);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [timeConflictWarning, setTimeConflictWarning] = useState<string | null>(null);

  const timeToSeconds = (timeStr: string): number => {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(":");
    const h = parseInt(parts[0] || "0", 10);
    const m = parseInt(parts[1] || "0", 10);
    return h * 3600 + m * 60;
  };

  const formatAmPm = (timeStr: string): string => {
    if (!timeStr) return "";
    const parts = timeStr.trim().split(":");
    let h = parseInt(parts[0] || "0", 10);
    const m = parts[1] || "00";
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    h = h ? h : 12;
    return `${h.toString().padStart(2, "0")}:${m} ${ampm}`;
  };

  const checkCollision = (
    start: string,
    end: string,
    slots?: EventHallAvailabilitySlot[]
  ): boolean => {
    if (!start || !end) {
      setTimeConflictWarning(null);
      return false;
    }

    const sSec = timeToSeconds(start);
    const eSec = timeToSeconds(end);

    if (eSec <= sSec) {
      setTimeConflictWarning("End time must be later than start time.");
      return true;
    }

    const currentSlots = slots || availability?.booked_slots || [];
    for (const slot of currentSlots) {
      const bStart = timeToSeconds(slot.start_time);
      const bEnd = timeToSeconds(slot.end_time);

      if (sSec < bEnd && eSec > bStart) {
        const slotText = `${formatAmPm(slot.start_time)} - ${formatAmPm(slot.end_time)}`;
        setTimeConflictWarning(
          `The window ${formatAmPm(start)} - ${formatAmPm(end)} overlaps with an existing reservation (${slotText}). Please pick an open window.`
        );
        return true;
      }
    }

    setTimeConflictWarning(null);
    return false;
  };

  const handleDateChange = async (date: string) => {
    setBookingForm((prev) => ({ ...prev, preferred_date: date }));
    setTimeConflictWarning(null);
    if (!date) {
      setAvailability(null);
      return;
    }

    setIsLoadingAvailability(true);
    try {
      const res = await getEventHallAvailability(date);
      if (res.success && res.data) {
        setAvailability(res.data);
        if (bookingForm.start_time && bookingForm.end_time) {
          checkCollision(bookingForm.start_time, bookingForm.end_time, res.data.booked_slots);
        }
      } else {
        setAvailability(null);
      }
    } catch {
      setAvailability(null);
    } finally {
      setIsLoadingAvailability(false);
    }
  };

  const handleTimeChange = (start: string, end: string) => {
    setBookingForm((prev) => ({ ...prev, start_time: start, end_time: end }));
    checkCollision(start, end);
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInquiryError("");

    if (!bookingForm.event_type) {
      setInquiryError("Please select an event category.");
      return;
    }

    if (bookingForm.start_time && bookingForm.end_time) {
      if (checkCollision(bookingForm.start_time, bookingForm.end_time)) {
        setInquiryError("Selected time slot is already reserved. Please select an available window.");
        return;
      }
    }

    setIsSubmittingInquiry(true);

    try {
      await submitEventHallInquiry({
        full_name: bookingForm.full_name.trim(),
        phone: bookingForm.phone.trim(),
        email: bookingForm.email.trim() || undefined,
        event_type: bookingForm.event_type,
        preferred_date: bookingForm.preferred_date,
        start_time: bookingForm.start_time || undefined,
        end_time: bookingForm.end_time || undefined,
        expected_guests: bookingForm.expected_guests ? Number(bookingForm.expected_guests) : undefined,
        message: bookingForm.message.trim() || undefined,
      });

      setInquirySubmitted(true);
    } catch (err: any) {
      setInquiryError(
        err.message || "Failed to submit inquiry. Please try again or reach out on WhatsApp."
      );
    } finally {
      setIsSubmittingInquiry(false);
    }
  };

  const resetBookingModal = () => {
    setIsBookingModalOpen(false);
    setInquirySubmitted(false);
    setInquiryError("");
    setTimeConflictWarning(null);
    setAvailability(null);
    setBookingForm({
      full_name: "",
      phone: "",
      email: "",
      event_type: "",
      preferred_date: "",
      start_time: "",
      end_time: "",
      expected_guests: "",
      message: "",
    });
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);

    const fetchCms = async () => {
      try {
        const data = await getCMSContent();
        setCmsData(data);
      } catch (error) {
        console.error("Failed to load CMS content:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCms();

    const fetchFeaturedMenu = async () => {
      try {
        const response = await apiClient.get<PaginatedResponse<MenuItem>>("/menu");
        if (response.success && Array.isArray(response.data)) {
          setFeaturedMenu(response.data.slice(0, 4));
        }
      } catch (error) {
        console.error("Failed to load menu items for landing:", error);
      }
    };
    fetchFeaturedMenu();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const handleWhatsApp = () => {
    const phone = cmsData?.contact.phone.replace(/[^0-9]/g, "") || "2349155290102";
    window.open(`https://wa.me/${phone}`, "_blank");
  };

  const navLinks = [
    { name: "About", href: "#about" },
    { name: "Menu", href: "/menu", isLink: true },
    { name: "Services", href: "#services" },
    { name: "Event Hall", href: "#event-hall" },
    { name: "Staff Mail", href: "https://privateemail.com", isExternal: true },
    { name: "Contact", href: "#contact" },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#8B1E1E] animate-spin" />
        <p className="text-xs text-stone-500 mt-2 font-medium">Welcome to Queen's Palace...</p>
      </div>
    );
  }

  if (!cmsData) return null;

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col font-sans text-stone-900 overflow-x-hidden">
      {/* Navbar */}
      <header
        className={`fixed top-0 left-0 w-full z-50 px-6 py-3 flex justify-between items-center transition-all duration-200 ${
          scrolled
            ? "bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-xs"
            : "bg-white/90 backdrop-blur-xs border-b border-stone-200/60"
        }`}
      >
        <Link to="/" className="flex items-center gap-3 group">
          <img src={queenLogo} alt="Queen's Palace" className="w-9 h-9 object-contain" />
          <div className="flex flex-col">
            <span className="font-semibold text-sm tracking-tight text-stone-900 leading-none">
              Queen's Palace
            </span>
            <span className="text-[10px] font-medium text-[#D4AF37] tracking-wider mt-0.5">
              Eatery & Event Hall
            </span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-6 text-xs font-medium">
          {navLinks.map((link) => {
            if (link.isLink) {
              return (
                <Link
                  key={link.name}
                  to={link.href}
                  className="text-stone-600 hover:text-[#8B1E1E] transition-colors"
                >
                  {link.name}
                </Link>
              );
            }
            if (link.isExternal) {
              return (
                <a
                  key={link.name}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-stone-600 hover:text-[#8B1E1E] transition-colors"
                >
                  {link.name}
                </a>
              );
            }
            return (
              <a
                key={link.name}
                href={link.href}
                className="text-stone-600 hover:text-[#8B1E1E] transition-colors"
              >
                {link.name}
              </a>
            );
          })}

          <div className="flex items-center gap-2 pl-2">
            <Link to="/login" className="text-stone-700 hover:text-stone-900 px-3 py-1.5 transition-colors">
              Staff Portal
            </Link>
            <Link
              to="/menu"
              className="bg-[#8B1E1E] text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-[#701515] transition-colors shadow-xs"
            >
              Order Online
            </Link>
          </div>
        </nav>

        {/* Mobile Toggle */}
        <button
          type="button"
          className="lg:hidden p-2 text-stone-700 hover:text-stone-900"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-white pt-20 px-6 flex flex-col gap-4 lg:hidden border-b border-stone-200 shadow-md">
          {navLinks.map((link) => {
            if (link.isLink) {
              return (
                <Link
                  key={link.name}
                  to={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-sm font-medium text-stone-800 hover:text-[#8B1E1E] py-1 border-b border-stone-100"
                >
                  {link.name}
                </Link>
              );
            }
            if (link.isExternal) {
              return (
                <a
                  key={link.name}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-stone-800 hover:text-[#8B1E1E] py-1 border-b border-stone-100"
                >
                  {link.name}
                </a>
              );
            }
            return (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-sm font-medium text-stone-800 hover:text-[#8B1E1E] py-1 border-b border-stone-100"
              >
                {link.name}
              </a>
            );
          })}
          <Link
            to="/menu"
            onClick={() => setIsMobileMenuOpen(false)}
            className="bg-[#8B1E1E] text-white text-center py-2.5 rounded-lg text-xs font-medium hover:bg-[#701515] transition-colors mt-2"
          >
            Order Online
          </Link>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative min-h-[85vh] bg-[#FAF9F6] border-b border-stone-200/60 flex items-center pt-24 pb-16">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center w-full">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-5"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/70 text-amber-900 text-xs font-medium">
              <Sparkles size={13} className="text-[#D4AF37]" />
              <span>Queen's Palace • Dutse, Jigawa State</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-stone-900 tracking-tight leading-tight">
              {cmsData.hero.title || "Fine Nigerian Dining & Grand Event Celebrations"}
            </h1>

            <p className="text-stone-600 text-base leading-relaxed max-w-lg">
              {cmsData.hero.subtitle ||
                "Experience royal hospitality in the heart of Dutse. From authentic northern delicacies to our prestigious banquet hall, we make every moment memorable."}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link to="/menu">
                <Button variant="primary" size="lg" icon={<ArrowRight size={15} />}>
                  Explore Menu
                </Button>
              </Link>
              <Button
                variant="outline"
                size="lg"
                icon={<Calendar size={15} />}
                onClick={() => setIsBookingModalOpen(true)}
              >
                Reserve Event Hall
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="relative flex flex-col gap-3"
          >
            <div className="relative aspect-[4/3] rounded-xl overflow-hidden shadow-sm border border-stone-200 bg-stone-100">
              {cmsData.hero.imageUrl ? (
                <img
                  src={resolveMediaUrl(cmsData.hero.imageUrl)}
                  alt="Queen's Palace dining atmosphere"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#2D1414] via-[#451616] to-[#1E0A0A] flex flex-col items-center justify-center p-8 text-center text-white relative">
                  <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center mb-3 shadow-lg">
                    <img src={queenLogo} alt="Queen's Palace" className="w-10 h-10 object-contain" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-[#D4AF37]">
                    Queen's Palace
                  </h3>
                  <p className="text-xs text-stone-300 tracking-wider uppercase mt-1 font-medium">
                    Eatery & Event Hall • Dutse
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-[11px] text-amber-200/90 bg-white/10 px-3.5 py-1.5 rounded-full border border-white/15">
                    <Sparkles size={13} className="text-[#D4AF37]" />
                    <span>Royal Hospitality & Delicacies</span>
                  </div>
                </div>
              )}
            </div>

            {/* Optional Additional Hero Images Showcase Strip */}
            {cmsData.hero.additionalImages && cmsData.hero.additionalImages.filter(Boolean).length > 0 && (
              <div className="grid grid-cols-3 gap-2.5">
                {cmsData.hero.additionalImages.filter(Boolean).slice(0, 3).map((extraImg, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-[4/3] rounded-lg overflow-hidden border border-stone-200 shadow-2xs bg-stone-100 group"
                  >
                    <img
                      src={resolveMediaUrl(extraImg)}
                      alt={`Dining atmosphere preview ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Feature Value Highlights */}
      <section className="bg-white border-b border-stone-200 py-8">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              title: "Signature Recipes",
              desc: "Authentic spices and traditional techniques",
              icon: Utensils,
            },
            {
              title: "Prompt Service",
              desc: "Quick counter pickup and doorstep delivery",
              icon: Clock,
            },
            {
              title: "Banquet Hall",
              desc: "Fully air-conditioned luxury event venue",
              icon: Sparkles,
            },
            {
              title: "Hygiene & Quality",
              desc: "Prepared fresh with supreme food safety",
              icon: ShieldCheck,
            },
          ].map((feat, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-lg border border-stone-100 bg-stone-50/50"
            >
              <div className="w-8 h-8 rounded-md bg-stone-100 text-stone-700 flex items-center justify-center shrink-0 border border-stone-200">
                <feat.icon size={16} />
              </div>
              <div>
                <h4 className="font-semibold text-xs text-stone-900">{feat.title}</h4>
                <p className="text-[11px] text-stone-500 mt-0.5 leading-snug">{feat.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-16 bg-[#FAF9F6] border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {cmsData.about.imageUrl && (
            <div className="relative aspect-[4/3] rounded-xl overflow-hidden shadow-xs border border-stone-200 bg-stone-100">
              <img
                src={resolveMediaUrl(cmsData.about.imageUrl)}
                alt="About Queen's Palace"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className={`space-y-4 ${!cmsData.about.imageUrl ? "lg:col-span-2 max-w-2xl mx-auto text-center" : ""}`}>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#8B1E1E]">
              Our Heritage
            </span>
            <h2 className="text-2xl sm:text-3xl font-semibold text-stone-900 tracking-tight">
              A Tradition of Hospitality in Jigawa
            </h2>
            <p className="text-stone-600 text-sm sm:text-base leading-relaxed">
              {cmsData.about.text}
            </p>
          </div>
        </div>
      </section>

      {/* Featured Menu Selection */}
      <section id="featured-menu" className="py-16 bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-6 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#8B1E1E]">
                Featured Dishes
              </span>
              <h2 className="text-2xl sm:text-3xl font-semibold text-stone-900 tracking-tight mt-0.5">
                Popular from Our Kitchen
              </h2>
            </div>
            <Link
              to="/menu"
              className="text-xs font-semibold text-[#8B1E1E] hover:underline flex items-center gap-1 group"
            >
              <span>Explore Complete Menu</span>
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {featuredMenu.length === 0 ? (
            <div className="py-12 px-6 rounded-xl border border-stone-200 bg-stone-50/60 text-center space-y-2">
              <Utensils size={32} className="mx-auto text-stone-400" />
              <h3 className="font-semibold text-stone-800 text-sm">Fresh Delicacies Coming Right Up</h3>
              <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
                Our kitchen is curating this season's finest dishes. Check our online catalog or contact our counter staff on WhatsApp to place a custom order!
              </p>
              <div className="pt-2">
                <Button variant="secondary" size="sm" onClick={handleWhatsApp} icon={<MessageSquare size={13} />}>
                  Chat with Chef / Counter
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {featuredMenu.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-lg border border-stone-200 overflow-hidden shadow-xs hover:border-stone-300 transition-colors flex flex-col justify-between"
                >
                  <div>
                    <div className="relative h-44 bg-stone-100 overflow-hidden">
                      <img
                        src={resolveMediaUrl(item.image_path || item.image)}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          if (!target.src.endsWith("/queen-logo.png")) {
                            target.src = "/queen-logo.png";
                          }
                        }}
                      />
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-stone-900 text-sm line-clamp-1 mb-1">
                        {item.name}
                      </h3>
                      <p className="text-xs font-semibold text-stone-900">{formatNaira(item.price)}</p>
                    </div>
                  </div>

                  <div className="p-4 pt-0">
                    <Link to="/menu" className="w-full block">
                      <Button variant="outline" size="sm" fullWidth>
                        Order Dish
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Hospitality Services */}
      <section id="services" className="py-16 bg-[#FAF9F6] border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-6 space-y-8">
          <div className="text-center max-w-lg mx-auto space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#8B1E1E]">
              Hospitality Services
            </span>
            <h2 className="text-2xl sm:text-3xl font-semibold text-stone-900 tracking-tight">
              Catering, Dining & Events
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {cmsData.services.map((srv) => {
              const IconComponent = (Icons as any)[srv.icon] || Utensils;
              return (
                <div
                  key={srv.id}
                  className="rounded-xl border border-stone-200 bg-white shadow-xs overflow-hidden flex flex-col group hover:shadow-md transition-shadow"
                >
                  {srv.imageUrl && (
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-stone-100 border-b border-stone-100">
                      <img
                        src={resolveMediaUrl(srv.imageUrl)}
                        alt={srv.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  <div className="p-6 space-y-3 flex-1 flex flex-col">
                    <div className="w-10 h-10 bg-stone-100 text-[#8B1E1E] rounded-lg flex items-center justify-center border border-stone-200 shrink-0">
                      <IconComponent size={18} />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-stone-900">{srv.title}</h3>
                      <p className="text-xs text-stone-600 leading-relaxed">{srv.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Event Hall Showcase */}
      <section id="event-hall" className="py-16 bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#8B1E1E]">
              Event Venue
            </span>
            <h2 className="text-2xl sm:text-3xl font-semibold text-stone-900 tracking-tight">
              Host Your Grand Celebration
            </h2>
            <p className="text-stone-600 text-sm leading-relaxed">
              {cmsData.eventHall.description}
            </p>
            <div className="pt-2">
              <Button
                variant="primary"
                size="md"
                icon={<Calendar size={15} />}
                onClick={() => setIsBookingModalOpen(true)}
              >
                Inquire About Hall
              </Button>
            </div>
          </div>

          {cmsData.eventHall.imageUrls && cmsData.eventHall.imageUrls.filter(Boolean).length > 0 ? (
            <div className={`grid gap-3 ${
              cmsData.eventHall.imageUrls.length === 1 
                ? "grid-cols-1" 
                : cmsData.eventHall.imageUrls.length === 3
                ? "grid-cols-2 sm:grid-cols-3"
                : "grid-cols-2"
            }`}>
              {cmsData.eventHall.imageUrls.map((url, i) => (
                <div
                  key={i}
                  className={`relative rounded-lg overflow-hidden border border-stone-200 bg-stone-100 shadow-xs group ${
                    cmsData.eventHall.imageUrls.length === 3 && i === 0 
                      ? "col-span-2 sm:col-span-1 aspect-square" 
                      : "aspect-square"
                  }`}
                >
                  <img
                    src={resolveMediaUrl(url)}
                    alt={`Event Hall view ${i + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-stone-200 bg-gradient-to-br from-stone-50 via-amber-50/30 to-stone-100 p-6 sm:p-8 space-y-4 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#8B1E1E] uppercase tracking-wider">
                <Sparkles size={14} className="text-[#D4AF37]" />
                <span>Premier Venue Highlights</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                {[
                  { label: "500+ Banquet Capacity", sub: "Spacious round-table seating" },
                  { label: "Fully Air-Conditioned", sub: "Climate-controlled ballroom" },
                  { label: "VIP Bridal & Dressing Suite", sub: "Private preparation quarters" },
                  { label: "Acoustic Audio & Lighting", sub: "Crystal chandeliers & stage sound" },
                  { label: "Standby 24/7 Power", sub: "Uninterrupted celebration energy" },
                  { label: "Ample Secure Parking", sub: "Guarded premises in Dutse" },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 p-3 rounded-lg bg-white border border-stone-200/80 shadow-2xs">
                    <CheckCircle2 size={16} className="text-[#8B1E1E] shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-semibold text-stone-900">{item.label}</h4>
                      <p className="text-[11px] text-stone-500 mt-0.5">{item.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="bg-[#2D1414] text-white pt-12 pb-8 border-t border-stone-800">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-10 pb-10 border-b border-stone-800 text-xs">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <img src={queenLogo} alt="Queen's Palace" className="w-8 h-8 object-contain" />
              <div>
                <span className="font-semibold text-sm tracking-tight block leading-none">
                  Queen's Palace
                </span>
                <span className="text-[10px] text-[#D4AF37] font-medium tracking-wider block mt-0.5">
                  Eatery & Event Hall
                </span>
              </div>
            </div>
            <p className="text-stone-300 leading-relaxed max-w-xs">
              Exceptional cuisine and premier event spaces located along Sani Abacha Way, Dutse, Jigawa State.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-white uppercase tracking-wider text-[11px]">
              Location & Contact
            </h4>
            <ul className="space-y-2 text-stone-300">
              <li className="flex items-center gap-2">
                <Phone size={14} className="text-[#D4AF37] shrink-0" />
                <span>{cmsData.contact.phone}</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin size={14} className="text-[#D4AF37] shrink-0 mt-0.5" />
                <span className="leading-relaxed">{cmsData.contact.address}</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-white uppercase tracking-wider text-[11px]">
              Navigation
            </h4>
            <div className="grid grid-cols-2 gap-2 text-stone-300">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="hover:text-white transition-colors"
                >
                  {link.name}
                </a>
              ))}
              <Link to="/login" className="hover:text-white transition-colors">
                Staff Login
              </Link>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-stone-400">
          <p>© {new Date().getFullYear()} Queen's Palace Eatery & Event Hall. All rights reserved.</p>
          <div className="flex gap-4">
            <span className="text-stone-400">Dutse, Jigawa State</span>
          </div>
        </div>
      </footer>

      {/* Booking Modal */}
      {isBookingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-stone-200 shadow-xl max-w-lg w-full overflow-hidden animate-scale-in">
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-stone-900">Event Hall Reservation Inquiry</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Host your wedding reception, corporate seminar, or private celebration.
                </p>
              </div>
              <button
                type="button"
                onClick={resetBookingModal}
                className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {inquirySubmitted ? (
              <div className="p-8 text-center space-y-4">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto border border-emerald-200">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-stone-900">Inquiry Received</h3>
                  <p className="text-xs text-stone-600 mt-1 max-w-sm mx-auto leading-relaxed">
                    Thank you, <strong>{bookingForm.full_name}</strong>. Our hall manager will review your date (<strong>{bookingForm.preferred_date}</strong>) and contact you at <strong>{bookingForm.phone}</strong>.
                  </p>
                </div>
                <div className="flex gap-2.5 pt-2">
                  <Button
                    variant="primary"
                    size="md"
                    fullWidth
                    icon={<MessageSquare size={14} />}
                    onClick={handleWhatsApp}
                  >
                    Chat on WhatsApp
                  </Button>
                  <Button variant="outline" size="md" onClick={resetBookingModal}>
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleBookingSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                {inquiryError && (
                  <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-xs text-red-700 font-medium flex items-center gap-2">
                    <AlertCircle size={15} className="shrink-0 text-red-600" />
                    <span>{inquiryError}</span>
                  </div>
                )}

                <Input
                  label="Your Full Name"
                  required
                  placeholder="e.g. Dr. Amina Bello"
                  value={bookingForm.full_name}
                  onChange={(e) => setBookingForm({ ...bookingForm, full_name: e.target.value })}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Phone Number"
                    type="tel"
                    required
                    placeholder="080 1234 5678"
                    value={bookingForm.phone}
                    onChange={(e) => setBookingForm({ ...bookingForm, phone: e.target.value })}
                  />
                  <Input
                    label="Email Address (Optional)"
                    type="email"
                    placeholder="you@example.com"
                    value={bookingForm.email}
                    onChange={(e) => setBookingForm({ ...bookingForm, email: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    label="Event Category"
                    required
                    value={bookingForm.event_type}
                    onChange={(e) => setBookingForm({ ...bookingForm, event_type: e.target.value })}
                    options={[
                      { value: "", label: "Select Event Category..." },
                      { value: "Wedding Reception", label: "Wedding Reception" },
                      { value: "Birthday Party", label: "Birthday Party" },
                      { value: "Corporate Meeting", label: "Corporate Meeting" },
                      { value: "Conference / Seminar", label: "Conference / Seminar" },
                      { value: "Dinner & Gala", label: "Dinner & Gala" },
                      { value: "Anniversary Celebration", label: "Anniversary Celebration" },
                      { value: "Other", label: "Other Occasion" },
                    ]}
                  />

                  <Input
                    label="Preferred Date"
                    type="date"
                    required
                    min={new Date().toISOString().split("T")[0]}
                    value={bookingForm.preferred_date}
                    onChange={(e) => handleDateChange(e.target.value)}
                  />
                </div>

                {/* Real-Time Slot Availability Panel */}
                {bookingForm.preferred_date && (
                  <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
                        <Clock size={13} className="text-[#8B1E1E]" />
                        Venue Schedule for {bookingForm.preferred_date}
                      </span>
                      {isLoadingAvailability && (
                        <span className="text-[10px] text-stone-500 flex items-center gap-1">
                          <Loader2 size={11} className="animate-spin text-[#8B1E1E]" />
                          Checking...
                        </span>
                      )}
                    </div>

                    {isLoadingAvailability ? (
                      <div className="py-2 text-center text-xs text-stone-400">
                        Checking slot availability...
                      </div>
                    ) : availability ? (
                      <div className="space-y-2">
                        {availability.is_fully_booked ? (
                          <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-semibold flex items-center gap-2">
                            <AlertCircle size={14} className="text-red-600 shrink-0" />
                            <span>This date is fully booked. Please select another date.</span>
                          </div>
                        ) : availability.booked_slots.length > 0 ? (
                          <div className="space-y-1.5">
                            <div className="text-[11px] text-stone-500 font-medium">
                              Reserved Slots (Unavailable):
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {availability.booked_slots.map((b, idx) => (
                                <span
                                  key={idx}
                                  className="px-2.5 py-1 rounded-md bg-red-50 border border-red-200 text-red-800 text-[11px] font-semibold flex items-center gap-1"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                  {formatAmPm(b.start_time)} - {formatAmPm(b.end_time)} (Booked)
                                </span>
                              ))}
                            </div>

                            <div className="text-[11px] text-emerald-700 font-medium pt-1">
                              Available Open Windows:
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {availability.available_windows.map((w, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleTimeChange(w.start_time, w.end_time)}
                                  className="px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 text-[11px] font-semibold transition-colors flex items-center gap-1"
                                  title="Click to select this free window"
                                >
                                  <Check size={11} className="text-emerald-600" />
                                  {formatAmPm(w.start_time)} - {formatAmPm(w.end_time)}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="p-2 rounded-lg bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center gap-1.5">
                            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                            <span>All hours are open for booking on this date (08:00 AM – 11:00 PM).</span>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Time Selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-stone-700 block">
                      Reservation Time Window
                    </label>
                    <span className="text-[10px] text-stone-400">Operating hours: 08:00 AM – 11:00 PM</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-stone-500 block mb-1">Start Time</label>
                      <input
                        type="time"
                        min="08:00"
                        max="22:00"
                        value={bookingForm.start_time}
                        onChange={(e) => handleTimeChange(e.target.value, bookingForm.end_time)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:ring-2 focus:ring-[#8B1E1E]/20 focus:border-[#8B1E1E] transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-stone-500 block mb-1">End Time</label>
                      <input
                        type="time"
                        min={bookingForm.start_time || "09:00"}
                        max="23:00"
                        value={bookingForm.end_time}
                        onChange={(e) => handleTimeChange(bookingForm.start_time, e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:ring-2 focus:ring-[#8B1E1E]/20 focus:border-[#8B1E1E] transition-all"
                      />
                    </div>
                  </div>

                  {/* Quick Slot Preset Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider mr-1">
                      Presets:
                    </span>
                    {[
                      { label: "Morning (09:00 - 13:00)", start: "09:00", end: "13:00" },
                      { label: "Afternoon (14:00 - 18:00)", start: "14:00", end: "18:00" },
                      { label: "Evening (18:00 - 22:00)", start: "18:00", end: "22:00" },
                      { label: "Full Day (09:00 - 21:00)", start: "09:00", end: "21:00" },
                    ].map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleTimeChange(p.start, p.end)}
                        className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                          bookingForm.start_time === p.start && bookingForm.end_time === p.end
                            ? "bg-[#8B1E1E] text-white border-[#8B1E1E] font-semibold"
                            : "bg-white text-stone-600 border-stone-200 hover:border-stone-300 hover:bg-stone-50"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Time Conflict Alert */}
                  {timeConflictWarning && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 font-medium flex items-start gap-2 animate-in fade-in duration-200">
                      <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                      <span>{timeConflictWarning}</span>
                    </div>
                  )}
                </div>

                <Input
                  label="Estimated Guest Count"
                  type="number"
                  min="1"
                  max="2000"
                  placeholder="e.g. 250"
                  value={bookingForm.expected_guests}
                  onChange={(e) =>
                    setBookingForm({ ...bookingForm, expected_guests: e.target.value })
                  }
                />

                <TextArea
                  label="Special Requirements / Catering Notes"
                  rows={2}
                  placeholder="Buffet requirements, projector/AV setup, hall decoration preferences..."
                  value={bookingForm.message}
                  onChange={(e) => setBookingForm({ ...bookingForm, message: e.target.value })}
                />

                <div className="p-4 bg-stone-50 -mx-6 -mb-6 mt-6 border-t border-stone-200 flex justify-end gap-2.5">
                  <Button type="button" variant="outline" size="md" onClick={resetBookingModal}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={isSubmittingInquiry}
                    disabled={
                      isSubmittingInquiry ||
                      Boolean(timeConflictWarning) ||
                      (availability?.is_fully_booked ?? false)
                    }
                  >
                    Submit Booking Request
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
