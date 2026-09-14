import React, { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  Users,
  Phone,
  Mail,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  Trash2,
  Edit3,
  MessageSquare,
  Plus,
  X,
} from "lucide-react";
import {
  getEventHallInquiries,
  getEventHallStats,
  updateEventHallInquiryStatus,
  deleteEventHallInquiry,
  submitEventHallInquiry,
  getEventHallAvailability,
} from "../../services/eventHallService";
import type {
  EventHallInquiry,
  EventHallStatsData,
  CreateEventHallInquiryData,
  EventHallAvailabilityResponse,
} from "../../types";
import { useUI } from "../../context/UIContext";
import { formatDistanceToNow, format } from "date-fns";
import { PageHeader, StatCard, Badge, ActionDropdown, ActionItem } from "../../components/ui";
import { SearchInput, TextArea, Input, Select } from "../../components/ui/Input";
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

const EVENT_TYPE_OPTIONS = [
  { value: "Wedding Reception", label: "Wedding Reception" },
  { value: "Birthday Celebration", label: "Birthday Celebration" },
  { value: "Corporate Seminar", label: "Corporate Seminar / Conference" },
  { value: "Banquet Dinner", label: "Banquet / Gala Dinner" },
  { value: "Anniversary Party", label: "Anniversary / Reunion" },
  { value: "Other Special Event", label: "Other Special Event" },
];

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

  // New reservation modal state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newForm, setNewForm] = useState<CreateEventHallInquiryData>({
    name: "",
    email: "",
    phone: "",
    event_type: "",
    expected_guests: undefined,
    preferred_date: "",
    start_time: "",
    end_time: "",
    message: "",
  });
  const [newFormErrors, setNewFormErrors] = useState<Record<string, string>>({});
  const [availability, setAvailability] = useState<EventHallAvailabilityResponse | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [isCreatingReservation, setIsCreatingReservation] = useState(false);

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

  // Real-time slot availability check for new reservation modal
  useEffect(() => {
    if (!newForm.preferred_date) {
      setAvailability(null);
      return;
    }
    let isMounted = true;
    setLoadingAvailability(true);
    getEventHallAvailability(newForm.preferred_date)
      .then((res) => {
        if (isMounted && res.success && res.data) {
          setAvailability(res.data);
        }
      })
      .catch(() => {
        if (isMounted) setAvailability(null);
      })
      .finally(() => {
        if (isMounted) setLoadingAvailability(false);
      });

    return () => {
      isMounted = false;
    };
  }, [newForm.preferred_date]);

  const checkTimeConflict = (startTime?: string, endTime?: string): boolean => {
    if (!startTime || !endTime || !availability?.booked_slots?.length) return false;
    const toMinutes = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + (m || 0);
    };
    const reqStart = toMinutes(startTime);
    const reqEnd = toMinutes(endTime);
    if (reqStart >= reqEnd) return false;

    return availability.booked_slots.some((slot) => {
      const slotStart = toMinutes(slot.start_time);
      const slotEnd = toMinutes(slot.end_time);
      return reqStart < slotEnd && reqEnd > slotStart;
    });
  };

  const hasNewConflict = checkTimeConflict(newForm.start_time, newForm.end_time);

  const handleOpenNewModal = () => {
    setNewForm({
      name: "",
      email: "",
      phone: "",
      event_type: "",
      expected_guests: undefined,
      preferred_date: "",
      start_time: "",
      end_time: "",
      message: "",
    });
    setNewFormErrors({});
    setAvailability(null);
    setIsNewModalOpen(true);
  };

  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!newForm.name.trim()) errors.name = "Customer name is required";
    if (!newForm.phone.trim()) errors.phone = "Phone number is required";
    if (!newForm.event_type) errors.event_type = "Please select event category";
    if (!newForm.preferred_date) errors.preferred_date = "Reservation date is required";

    if (newForm.start_time && newForm.end_time) {
      if (newForm.start_time >= newForm.end_time) {
        errors.end_time = "End time must be after start time";
      } else if (hasNewConflict) {
        errors.start_time = "Selected time interval overlaps with an existing booking";
      }
    }

    if (Object.keys(errors).length > 0) {
      setNewFormErrors(errors);
      return;
    }

    setIsCreatingReservation(true);
    try {
      const res = await submitEventHallInquiry({
        ...newForm,
        expected_guests: newForm.expected_guests ? Number(newForm.expected_guests) : undefined,
      });

      if (res.success) {
        showToast("Event hall reservation created successfully", "success");
        setIsNewModalOpen(false);
        loadData();
      } else {
        showToast(res.message || "Failed to create reservation", "error");
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to create reservation", "error");
    } finally {
      setIsCreatingReservation(false);
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
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={handleOpenNewModal}
          >
            New Reservation
          </Button>
        }
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
                    <span className="text-xs font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded capitalize">
                      {inq.event_type.replace(/_/g, " ")}
                    </span>
                    {inq.start_time && inq.end_time && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded">
                        <Clock size={12} className="text-amber-600" />
                        {inq.start_time.slice(0, 5)} - {inq.end_time.slice(0, 5)}
                      </span>
                    )}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-stone-100 text-xs text-stone-600">
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
                    <Clock size={14} className="text-stone-400 shrink-0" />
                    <span>
                      Time:{" "}
                      <strong className="text-stone-800">
                        {inq.start_time && inq.end_time
                          ? `${inq.start_time.slice(0, 5)} - ${inq.end_time.slice(0, 5)}`
                          : "Flexible / Full Day"}
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

      {/* New Reservation Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-2xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <div>
                <h3 className="text-base font-semibold text-stone-900">
                  New Event Hall Reservation
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Directly record a booking inquiry or walk-in reservation with real-time slot checking.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateReservation}>
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Customer / Organizer Full Name *"
                    placeholder="e.g. Alh. Ibrahim Babangida"
                    value={newForm.name}
                    onChange={(e) => {
                      setNewForm((prev) => ({ ...prev, name: e.target.value }));
                      if (newFormErrors.name) setNewFormErrors((prev) => ({ ...prev, name: "" }));
                    }}
                    error={newFormErrors.name}
                  />

                  <Input
                    label="Phone Number *"
                    placeholder="e.g. 08012345678"
                    value={newForm.phone}
                    onChange={(e) => {
                      setNewForm((prev) => ({ ...prev, phone: e.target.value }));
                      if (newFormErrors.phone) setNewFormErrors((prev) => ({ ...prev, phone: "" }));
                    }}
                    error={newFormErrors.phone}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Email Address (Optional)"
                    type="email"
                    placeholder="e.g. client@example.com"
                    value={newForm.email}
                    onChange={(e) => setNewForm((prev) => ({ ...prev, email: e.target.value }))}
                  />

                  <Select
                    label="Event Category *"
                    value={newForm.event_type}
                    onChange={(e) => {
                      setNewForm((prev) => ({ ...prev, event_type: e.target.value }));
                      if (newFormErrors.event_type)
                        setNewFormErrors((prev) => ({ ...prev, event_type: "" }));
                    }}
                    placeholder="Select event category..."
                    options={EVENT_TYPE_OPTIONS}
                    error={newFormErrors.event_type}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Expected Guest Count"
                    type="number"
                    min={1}
                    placeholder="e.g. 250"
                    value={newForm.expected_guests ?? ""}
                    onChange={(e) =>
                      setNewForm((prev) => ({
                        ...prev,
                        expected_guests: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                  />

                  <Input
                    label="Preferred Date *"
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    value={newForm.preferred_date}
                    onChange={(e) => {
                      setNewForm((prev) => ({ ...prev, preferred_date: e.target.value }));
                      if (newFormErrors.preferred_date)
                        setNewFormErrors((prev) => ({ ...prev, preferred_date: "" }));
                    }}
                    error={newFormErrors.preferred_date}
                  />
                </div>

                {/* Real-Time Slot Availability Feedback */}
                {newForm.preferred_date && (
                  <div className="bg-stone-50 rounded-xl p-4 border border-stone-200 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-stone-700 flex items-center gap-1.5">
                        <Clock size={14} className="text-[#8B1E1E]" />
                        Venue Schedule for {newForm.preferred_date}
                      </span>
                      {loadingAvailability ? (
                        <span className="text-stone-400 animate-pulse">Checking slots...</span>
                      ) : availability?.booked_slots && availability.booked_slots.length > 0 ? (
                        <span className="font-medium text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded text-[11px]">
                          {availability.booked_slots.length} Booked Window{availability.booked_slots.length > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="font-medium text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded text-[11px]">
                          All Slots Open (08:00 - 23:00)
                        </span>
                      )}
                    </div>

                    {availability?.booked_slots && availability.booked_slots.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[11px] text-stone-500 font-medium">
                          Reserved / Occupied Time Windows:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {availability.booked_slots.map((slot, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-red-50 text-red-700 border border-red-200 font-medium"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                              <span className="text-[10px] text-red-500 capitalize">
                                ({slot.event_type.replace(/_/g, " ")})
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Time Selection with quick presets */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-stone-700">
                      Select Event Hours (Operating: 08:00 - 23:00)
                    </label>
                    <div className="flex items-center gap-1 text-[11px]">
                      <span className="text-stone-400">Presets:</span>
                      {[
                        { label: "Morning", s: "09:00", e: "13:00" },
                        { label: "Afternoon", s: "14:00", e: "18:00" },
                        { label: "Evening", s: "18:00", e: "22:00" },
                        { label: "All Day", s: "09:00", e: "22:00" },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setNewForm((prev) => ({
                              ...prev,
                              start_time: preset.s,
                              end_time: preset.e,
                            }));
                          }}
                          className="px-1.5 py-0.5 text-[10px] font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 rounded transition-colors"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Start Time"
                      type="time"
                      value={newForm.start_time}
                      onChange={(e) =>
                        setNewForm((prev) => ({ ...prev, start_time: e.target.value }))
                      }
                      error={newFormErrors.start_time}
                    />

                    <Input
                      label="End Time"
                      type="time"
                      value={newForm.end_time}
                      onChange={(e) =>
                        setNewForm((prev) => ({ ...prev, end_time: e.target.value }))
                      }
                      error={newFormErrors.end_time}
                    />
                  </div>
                </div>

                {/* Conflict Warning Banner */}
                {hasNewConflict && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs">
                    <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-semibold">Slot Collision Detected</strong>
                      The requested window ({newForm.start_time} - {newForm.end_time}) overlaps with an existing reservation on this date. Please pick an alternative unoccupied time slot.
                    </div>
                  </div>
                )}

                <TextArea
                  label="Inquiry / Event Notes (Optional)"
                  rows={2}
                  value={newForm.message}
                  onChange={(e) => setNewForm((prev) => ({ ...prev, message: e.target.value }))}
                  placeholder="e.g. Special hall decoration, projector setup, or catering requirements..."
                />
              </div>

              <div className="p-4 bg-stone-50 border-t border-stone-200 flex justify-end gap-2.5">
                <Button
                  variant="outline"
                  size="md"
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  type="submit"
                  disabled={hasNewConflict || isCreatingReservation}
                  loading={isCreatingReservation}
                >
                  Confirm Reservation
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
