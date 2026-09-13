import React, { useState, useEffect } from "react";
import { apiClient } from "../../services/apiClient";
import { useUI } from "../../context/UIContext";
import {
  User,
  Shield,
  ShieldCheck,
  Ban,
  Clock,
  Trash2,
  Users,
  UserPlus,
  Key,
} from "lucide-react";
import { format } from "date-fns";
import { PageHeader, Badge, ActionDropdown, ActionItem, ErrorBoundary } from "../../components/ui";
import { SearchInput, Input, Select } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

interface UserProfile {
  id: string;
  name: string;
  full_name?: string;
  email: string;
  role: string;
  role_name?: string;
  role_display_name?: string;
  status: "active" | "suspended" | "restricted" | "deleted";
  suspensionReason?: string;
  suspension_reason?: string;
  suspensionEndDate?: any;
  suspension_end_date?: any;
  permissions?: {
    manageInventory?: boolean;
    manageOrders?: boolean;
    manageMenu?: boolean;
    manageReports?: boolean;
    manageCMS?: boolean;
    manageNotifications?: boolean;
    manageStaff?: boolean;
    viewDashboard?: boolean;
    [key: string]: any;
  };
}

export const StaffManagement: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"staff" | "customers">("staff");

  const [showSuspendModal, setShowSuspendModal] = useState<UserProfile | null>(null);
  const [suspensionData, setSuspensionData] = useState({ reason: "", duration: "1" });

  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newStaffData, setNewStaffData] = useState({
    name: "",
    email: "",
    password: "",
    role: "cashier",
  });

  const { showToast, setLoading: setGlobalLoading } = useUI();

  const [showPermissionsModal, setShowPermissionsModal] = useState<UserProfile | null>(null);
  const [tempPermissions, setTempPermissions] = useState({
    manageInventory: false,
    manageOrders: false,
    manageMenu: false,
    manageReports: false,
    manageCMS: false,
    manageNotifications: false,
    manageStaff: false,
    viewDashboard: false,
  });

  const handleOpenPermissionsModal = (user: UserProfile) => {
    setShowPermissionsModal(user);
    setTempPermissions({
      manageInventory: user.permissions?.manageInventory ?? false,
      manageOrders: user.permissions?.manageOrders ?? false,
      manageMenu: user.permissions?.manageMenu ?? false,
      manageReports: user.permissions?.manageReports ?? false,
      manageCMS: user.permissions?.manageCMS ?? false,
      manageNotifications: user.permissions?.manageNotifications ?? false,
      manageStaff: user.permissions?.manageStaff ?? false,
      viewDashboard: user.permissions?.viewDashboard ?? false,
    });
  };

  const handleSavePermissions = async () => {
    if (!showPermissionsModal) return;
    setGlobalLoading(true);
    try {
      await apiClient.put(`/users/${showPermissionsModal.id}/permissions`, {
        permissions: tempPermissions,
      });
      showToast(`Permissions updated for ${showPermissionsModal.name}`, "success");
      setShowPermissionsModal(null);
      fetchUsers();
    } catch (error: any) {
      showToast(`Failed to update permissions: ${error.message}`, "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response: any = await apiClient.get("/users");
      const listData = response?.data;
      const rawList: any[] = Array.isArray(listData)
        ? listData
        : Array.isArray(listData?.data)
        ? listData.data
        : Array.isArray(listData?.users)
        ? listData.users
        : [];

      const normalized: UserProfile[] = rawList.map((u: any) => {
        const displayName =
          u.name ||
          u.full_name ||
          (u.email ? u.email.split("@")[0] : "") ||
          "User";
        const role = (u.role || u.role_name || "customer").toLowerCase();

        return {
          id: String(u.id),
          name: displayName,
          full_name: u.full_name || displayName,
          email: u.email || "",
          role,
          role_name: u.role_name || role,
          role_display_name:
            u.role_display_name ||
            (role === "super_admin"
              ? "Super Admin"
              : role.charAt(0).toUpperCase() + role.slice(1)),
          status: (u.status || "active").toLowerCase() as any,
          suspensionReason: u.suspensionReason || u.suspension_reason || "",
          suspensionEndDate: u.suspensionEndDate || u.suspension_end_date || null,
          permissions: u.permissions || {},
        };
      });

      setUsers(normalized);
    } catch (error: any) {
      console.error(error);
      showToast(error.message || "Failed to fetch users", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const isStaffRole = (role?: string) => {
    const r = (role || "").toLowerCase();
    return r !== "customer" && r !== "";
  };

  const staff = users.filter((u) => isStaffRole(u.role));
  const customers = users.filter((u) => !isStaffRole(u.role));

  const currentList = activeTab === "staff" ? staff : customers;

  const filteredUsers = currentList.filter(
    (u) =>
      (u.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalLoading(true);

    try {
      const response = await apiClient.post("/users/create-staff", newStaffData);

      if (response.success) {
        showToast("Staff member added successfully", "success");
        setShowAddStaffModal(false);
        setNewStaffData({ name: "", email: "", password: "", role: "cashier" });
        fetchUsers();
      } else {
        showToast(response.message || "Failed to add staff", "error");
      }
    } catch (error: any) {
      showToast(error.message || "Network error while adding staff", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${name}? This action cannot be undone.`))
      return;

    setGlobalLoading(true);

    try {
      const response = await apiClient.delete(`/users/${id}`);

      if (response.success) {
        showToast("User deleted successfully", "success");
        fetchUsers();
      } else {
        showToast(response.message || "Failed to delete user", "error");
      }
    } catch (error: any) {
      showToast(error.message || "Network error while deleting user", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!showSuspendModal) return;
    setGlobalLoading(true);

    try {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + parseInt(suspensionData.duration));

      const response = await apiClient.patch(`/users/${showSuspendModal.id}/status`, {
        status: "suspended",
        reason: suspensionData.reason,
        endDate: endDate.toISOString(),
      });

      if (response.success) {
        showToast(`Staff ${showSuspendModal.name} suspended.`, "success");
        setShowSuspendModal(null);
        setSuspensionData({ reason: "", duration: "1" });
        fetchUsers();
      } else {
        showToast(response.message || "Failed to suspend staff", "error");
      }
    } catch (error: any) {
      showToast(error.message || "Failed to suspend staff", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleLiftSuspension = async (id: string, name: string) => {
    setGlobalLoading(true);
    try {
      const response = await apiClient.patch(`/users/${id}/status`, {
        status: "active",
      });
      if (response.success) {
        showToast(`Suspension lifted for ${name}.`, "success");
        fetchUsers();
      } else {
        showToast(response.message || "Failed to lift suspension", "error");
      }
    } catch (error: any) {
      showToast(error.message || "Failed to lift suspension", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const getRoleBadgeVariant = (role?: string) => {
    if (!role) return "default";
    switch (role.toLowerCase()) {
      case "admin":
      case "super_admin":
        return "neutral";
      case "kitchen":
        return "warning";
      case "cashier":
        return "info";
      default:
        return "default";
    }
  };

  const formatSuspensionDate = (val: any): string => {
    if (!val) return "";
    try {
      const d = new Date(val);
      return isNaN(d.getTime()) ? "" : format(d, "dd MMM yyyy");
    } catch {
      return "";
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center bg-white rounded-lg border border-stone-200">
        <div className="w-7 h-7 border-2 border-[#8B1E1E] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-stone-500 font-medium">Loading user directory...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary title="Staff Management Error">
      <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Staff & User Management"
        description="Oversee employee access roles, individual permissions, account status, and customer profiles."
        actions={
          <div className="flex items-center gap-2.5">
            <div className="inline-flex p-0.5 rounded-lg bg-stone-100 border border-stone-200">
              <button
                type="button"
                onClick={() => setActiveTab("staff")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                  activeTab === "staff"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <User size={13} /> Staff ({staff.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("customers")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                  activeTab === "customers"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <Users size={13} /> Customers ({customers.length})
              </button>
            </div>

            {activeTab === "staff" && (
              <Button
                variant="primary"
                size="md"
                icon={<UserPlus size={16} />}
                onClick={() => setShowAddStaffModal(true)}
              >
                Add Staff
              </Button>
            )}
          </div>
        }
      />

      {/* Search Bar */}
      <div className="w-full sm:w-80">
        <SearchInput
          placeholder={`Search ${activeTab} by name or email...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onClear={() => setSearchTerm("")}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-stone-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-stone-500 font-medium">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4">Account Notes</th>
                <th className="py-3 px-4 text-right w-16">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-700">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-stone-400">
                    No {activeTab} matching your search criteria
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isSuspended = user.status === "suspended";

                  const actions: ActionItem[] = [
                    ...(user.role !== "admin" && user.role !== "super_admin"
                      ? [
                          {
                            label: "Edit Permissions",
                            icon: <Key size={14} />,
                            onClick: () => handleOpenPermissionsModal(user),
                          },
                          isSuspended
                            ? {
                                label: "Lift Suspension",
                                icon: <ShieldCheck size={14} className="text-emerald-600" />,
                                onClick: () => handleLiftSuspension(user.id, user.name),
                              }
                            : {
                                label: "Suspend Account",
                                icon: <Ban size={14} className="text-amber-600" />,
                                onClick: () => setShowSuspendModal(user),
                              },
                        ]
                      : []),
                    {
                      label: "Delete User",
                      icon: <Trash2 size={14} />,
                      danger: true,
                      onClick: () => handleDeleteUser(user.id, user.name),
                    },
                  ];

                  const suspensionDateFormatted = formatSuspensionDate(user.suspensionEndDate);

                  return (
                    <tr key={user.id} className="hover:bg-stone-50 transition-colors h-14">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center font-semibold text-xs border border-stone-200 shrink-0">
                            {(user.name || user.full_name || "U").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-stone-900 truncate">
                              {user.name || user.full_name || "User"}
                            </div>
                            <div className="text-[11px] text-stone-400 truncate">{user.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-4">
                        <Badge size="sm" variant={getRoleBadgeVariant(user.role)}>
                          {user.role_display_name || user.role}
                        </Badge>
                      </td>

                      <td className="py-2.5 px-4 text-center">
                        <Badge size="sm" variant={isSuspended ? "error" : "success"}>
                          <span
                            className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                              isSuspended ? "bg-red-500" : "bg-emerald-500"
                            }`}
                          />
                          {user.status || "active"}
                        </Badge>
                      </td>

                      <td className="py-2.5 px-4">
                        <div className="text-[11px] text-stone-500">
                          {isSuspended && suspensionDateFormatted ? (
                            <div className="flex items-center gap-1 text-red-700">
                              <Clock size={12} />
                              <span>Until {suspensionDateFormatted}</span>
                            </div>
                          ) : isSuspended && user.suspensionReason ? (
                            <span className="italic text-stone-600">"{user.suspensionReason}"</span>
                          ) : (
                            <span className="text-stone-400">Normal standing</span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-4 text-right">
                        <ActionDropdown items={actions} align="right" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Permissions Modal */}
      {showPermissionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-stone-200 shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="px-6 py-4 border-b border-stone-200">
              <h2 className="text-base font-semibold text-stone-900">Feature Permissions</h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Set operational access permissions for {showPermissionsModal.name}
              </p>
            </div>

            <div className="p-6 space-y-2 max-h-[360px] overflow-y-auto">
              {Object.keys(tempPermissions).map((permission) => (
                <label
                  key={permission}
                  className="flex items-center justify-between p-3 bg-stone-50 hover:bg-stone-100 rounded-lg border border-stone-200 cursor-pointer transition-colors"
                >
                  <span className="text-xs font-medium text-stone-800">
                    {permission.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-[#8B1E1E] focus:ring-[#8B1E1E] accent-[#8B1E1E] cursor-pointer"
                    checked={(tempPermissions as any)[permission]}
                    onChange={(e) =>
                      setTempPermissions({
                        ...tempPermissions,
                        [permission]: e.target.checked,
                      })
                    }
                  />
                </label>
              ))}
            </div>

            <div className="p-4 bg-stone-50 border-t border-stone-200 flex justify-end gap-2.5">
              <Button
                variant="outline"
                size="md"
                onClick={() => setShowPermissionsModal(null)}
              >
                Cancel
              </Button>
              <Button variant="primary" size="md" onClick={handleSavePermissions}>
                Save Permissions
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Suspension Modal */}
      {showSuspendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-stone-200 shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="px-6 py-4 border-b border-stone-200">
              <h2 className="text-base font-semibold text-stone-900">Suspend Account</h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Restrict access for {showSuspendModal.name}
              </p>
            </div>

            <div className="p-6 space-y-4">
              <Select
                label="Suspension Duration"
                value={suspensionData.duration}
                onChange={(e) =>
                  setSuspensionData({ ...suspensionData, duration: e.target.value })
                }
                options={[
                  { value: "1", label: "1 Day" },
                  { value: "3", label: "3 Days" },
                  { value: "7", label: "1 Week" },
                  { value: "30", label: "1 Month" },
                  { value: "365", label: "1 Year" },
                ]}
              />

              <Input
                label="Reason for Suspension"
                type="text"
                placeholder="e.g. Disciplinary review, policy violation..."
                value={suspensionData.reason}
                onChange={(e) =>
                  setSuspensionData({ ...suspensionData, reason: e.target.value })
                }
                required
              />
            </div>

            <div className="p-4 bg-stone-50 border-t border-stone-200 flex justify-end gap-2.5">
              <Button
                variant="outline"
                size="md"
                onClick={() => setShowSuspendModal(null)}
              >
                Cancel
              </Button>
              <Button variant="danger" size="md" onClick={handleSuspend}>
                Suspend Account
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-stone-200 shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="px-6 py-4 border-b border-stone-200">
              <h2 className="text-base font-semibold text-stone-900">Create Staff Account</h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Register cashier, kitchen, or management personnel
              </p>
            </div>

            <form onSubmit={handleAddStaff}>
              <div className="p-6 space-y-3.5">
                <Input
                  label="Full Name"
                  type="text"
                  required
                  placeholder="e.g. Jane Doe"
                  value={newStaffData.name}
                  onChange={(e) => setNewStaffData({ ...newStaffData, name: e.target.value })}
                />

                <Input
                  label="Email Address"
                  type="email"
                  required
                  placeholder="e.g. jane@queenspalaceeatery.com"
                  value={newStaffData.email}
                  onChange={(e) => setNewStaffData({ ...newStaffData, email: e.target.value })}
                />

                <Select
                  label="System Role"
                  value={newStaffData.role}
                  onChange={(e) => setNewStaffData({ ...newStaffData, role: e.target.value })}
                  options={[
                    { value: "cashier", label: "Cashier" },
                    { value: "kitchen", label: "Kitchen Staff" },
                    { value: "admin", label: "Admin" },
                  ]}
                />

                <Input
                  label="Initial Password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newStaffData.password}
                  onChange={(e) =>
                    setNewStaffData({ ...newStaffData, password: e.target.value })
                  }
                />
              </div>

              <div className="p-4 bg-stone-50 border-t border-stone-200 flex justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setShowAddStaffModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="md">
                  Create Account
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </ErrorBoundary>
  );
};
