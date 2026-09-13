import React, { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  Users,
  Phone,
  Mail,
  CheckCircle2,
  Clock,
  AlertCircle,
  Trash2,
  Edit3,
  MessageSquare,
  X,
} from "lucide-react";
import {
  getEventHallInquiries,
  getEventHallStats,
  updateEventHallInquiryStatus,
  deleteEventHallInquiry,
} from "../../services/eventHallService";
import type { EventHallInquiry, EventHallStatsData } from "../../types";
import { useUI } from "../../context/UIContext";
import { formatDistanceToNow, format } from "date-fns";
import { PageHeader, StatCard, Badge, ActionDropdown, ActionItem } from "../../components/ui";
import { SearchInput, TextArea } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "warning" | "info" | "success" | "error" | "neutral" }
> = {
  new: { label: "New", variant: "warning" },
  contacted: { label: "Contacted", variant: "info" },
  confirmed: { label: "Confirmed", variant: "success" },
  declined: { label: "Declined", variant: "error" },
  completed: { label: "Completed", variant: "neutral" },
};

export const EventHallManagement: React.FC = () => {
  const [inquiries, setInquiries] = useState<EventHallInquiry[]>([]);
  const [stats, setStats] = useState<EventHallStatsData>({
    total: 0,
    new: 0,
    contacted: 0,
    confirmed: 0,
    declined: 0,
    completed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [, setTotalCount] = useState(0);

  // Status edit modal state
  const [selectedInquiry, setSelectedInquiry] = useState<EventHallInquiry | null>(null);
  const [editStatus, setEditStatus] = useState<string>("new");
  const [adminNotes, setAdminNotes] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);

  const { showToast } = useUI();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        getEventHallInquiries({
          status: activeStatus === "all" ? undefined : activeStatus,
          search: search.trim() || undefined,
          page,
          per_page: 20,
        }),
        getEventHallStats(),
      ]);

      if (listRes.data) {
        setInquiries(listRes.data);
        setTotalCount(listRes.pagination?.total || listRes.data.length || 0);
      }
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
    } catch {
      showToast("Failed to load event hall inquiries", "error");
    } finally {
      setLoading(false);
    }
  }, [activeStatus, search, page, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenStatusModal = (inquiry: EventHallInquiry) => {
    setSelectedInquiry(inquiry);
    setEditStatus(inquiry.status);
    setAdminNotes(inquiry.admin_notes || "");
  };

  const handleSaveStatus = async () => {
    if (!selectedInquiry) return;
    setIsUpdating(true);
    try {
      await updateEventHallInquiryStatus(selectedInquiry.id, {
        status: editStatus as any,
        admin_notes: adminNotes.trim() || undefined,
      });
      showToast("Inquiry status updated successfully", "success");
      setSelectedInquiry(null);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to update inquiry", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this event hall inquiry?")) {
      return;
    }
    try {
      await deleteEventHallInquiry(id);
      showToast("Inquiry deleted successfully", "success");
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to delete inquiry", "error");
    }
  };

  const getWhatsAppLink = (phone: string, name: string, eventType: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const formattedPhone = cleanPhone.startsWith("0") ? "234" + cleanPhone.slice(1) : cleanPhone;
    const msg = encodeURIComponent(
      `Hello ${name}, thank you for inquiring about our Event Hall for your ${eventType} at Queen's Palace. How can we assist with your plans?`
    );
    return `https://wa.me/${formattedPhone}?text=${msg}`;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Event Hall Bookings"
        description="Review customer booking inquiries, manage event reservation statuses, and coordinate client communication."
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Inquiries"
          value={stats.total}
          icon={<Calendar size={16} />}
        />
        <StatCard
          label="New Leads"
          value={stats.new}
          change={stats.new > 0 ? "Requires review" : "Up to date"}
          trend={stats.new > 0 ? "up" : "neutral"}
          icon={<AlertCircle size={16} />}
        />
        <StatCard
          label="Confirmed Events"
          value={stats.confirmed}
          trend="up"
          icon={<CheckCircle2 size={16} />}
        />
        <StatCard
          label="Completed Events"
          value={stats.completed}
          icon={<Clock size={16} />}
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Status Filter Tabs */}
        <div className="inline-flex p-0.5 rounded-lg bg-stone-100 border border-stone-200 overflow-x-auto">
          {["all", "new", "contacted", "confirmed", "declined", "completed"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setActiveStatus(st);
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap ${
                activeStatus === st
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="w-full sm:w-72">
          <SearchInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            onClear={() => {
              setSearch("");
              setPage(1);
            }}
            placeholder="Search name, phone, email..."
          />
        </div>
      </div>

      {/* Inquiries Content */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center bg-white rounded-lg border border-stone-200">
          <div className="w-7 h-7 border-2 border-[#8B1E1E] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs text-stone-500 font-medium">Loading event inquiries...</p>
        </div>
      ) : inquiries.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center bg-white rounded-lg border border-dashed border-stone-300 text-center px-4">
          <Calendar size={36} className="text-stone-300 mb-2" />
          <p className="text-sm font-medium text-stone-700">No event inquiries found</p>
          <p className="text-xs text-stone-400 mt-0.5">
            There are no booking requests matching the current status filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {inquiries.map((inq) => {
            const statusConfig = STATUS_CONFIG[inq.status] || STATUS_CONFIG.new;
            const dateObj = new Date(inq.preferred_date);
            const createdObj = new Date(inq.created_at.replace(/-/g, "/"));

            const actions: ActionItem[] = [
              {
                label: "Update Status",
                icon: <Edit3 size={14} />,
                onClick: () => handleOpenStatusModal(inq),
              },
              {
                label: "Delete Inquiry",
                icon: <Trash2 size={14} />,
                danger: true,
                onClick: () => handleDelete(inq.id),
              },
            ];

            return (
              <div
                key={inq.id}
                className="bg-white p-5 rounded-lg border border-stone-200 shadow-xs hover:border-stone-300 transition-colors space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-sm font-semibold text-stone-900">{inq.full_name}</h3>
                    <Badge size="sm" variant={statusConfig.variant}>
                      {statusConfig.label}
                    </Badge>
                    <span className="text-xs font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded">
                      {inq.event_type}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${inq.phone}`}
                      className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 transition-colors"
                      title="Call Client"
                    >
                      <Phone size={13} className="text-stone-500" />
                      <span>{inq.phone}</span>
                    </a>

                    <a
                      href={getWhatsAppLink(inq.phone, inq.full_name, inq.event_type)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                      title="Chat on WhatsApp"
                    >
                      <MessageSquare size={13} />
                      <span>WhatsApp</span>
                    </a>

                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Edit3 size={13} />}
                      onClick={() => handleOpenStatusModal(inq)}
                    >
                      Status
                    </Button>

                    <ActionDropdown items={actions} align="right" />
                  </div>
                </div>

                {/* Details Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-stone-100 text-xs text-stone-600">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={14} className="text-stone-400 shrink-0" />
                    <span>
                      Date:{" "}
                      <strong className="text-stone-800">
                        {isNaN(dateObj.getTime())
                          ? inq.preferred_date
                          : format(dateObj, "EEE, dd MMM yyyy")}
                      </strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Users size={14} className="text-stone-400 shrink-0" />
                    <span>
                      Expected Guests:{" "}
                      <strong className="text-stone-800">
                        {inq.expected_guests ? `${inq.expected_guests}` : "Not specified"}
                      </strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-stone-400">
                    <Clock size={14} className="shrink-0" />
                    <span>
                      Submitted {formatDistanceToNow(createdObj, { addSuffix: true })}
                    </span>
                  </div>
                </div>

                {/* Client message if provided */}
                {inq.message && (
                  <div className="bg-stone-50 p-3 rounded-md border border-stone-100 text-xs text-stone-700">
                    <span className="font-medium text-stone-500 uppercase tracking-wider text-[10px] block mb-0.5">
                      Client Request Note:
                    </span>
                    <p className="leading-relaxed">{inq.message}</p>
                  </div>
                )}

                {/* Internal admin notes */}
                {inq.admin_notes && (
                  <div className="bg-amber-50/60 p-3 rounded-md border border-amber-200/60 text-xs text-amber-900">
                    <span className="font-medium text-amber-800 uppercase tracking-wider text-[10px] block mb-0.5">
                      Internal Coordinator Notes:
                    </span>
                    <p className="leading-relaxed">{inq.admin_notes}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Status Update Modal */}
      {selectedInquiry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-stone-200 shadow-xl max-w-md w-full overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
              <div>
                <h2 className="text-base font-semibold text-stone-900">Update Booking Status</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  {selectedInquiry.full_name} • {selectedInquiry.event_type}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInquiry(null)}
                className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-stone-700 select-none block mb-2">
                  Inquiry Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {["new", "contacted", "confirmed", "declined", "completed"].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setEditStatus(st)}
                      className={`py-2 px-2 text-xs font-medium rounded-lg border capitalize transition-colors text-center ${
                        editStatus === st
                          ? "bg-[#8B1E1E] text-white border-[#8B1E1E]"
                          : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <TextArea
                label="Internal Coordinator Notes"
                rows={3}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="e.g. Discussed hall capacity and catering options with client. Sent custom quote..."
              />
            </div>

            <div className="p-4 bg-stone-50 border-t border-stone-200 flex justify-end gap-2.5">
              <Button
                variant="outline"
                size="md"
                onClick={() => setSelectedInquiry(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={isUpdating}
                onClick={handleSaveStatus}
              >
                Save Status
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
