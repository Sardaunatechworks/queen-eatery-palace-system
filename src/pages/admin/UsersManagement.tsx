import React, { useState, useEffect, useMemo } from "react";
import { apiClient } from "../../services/apiClient";
import { UserProfile, UserRole } from "../../context/AuthContext";
import { useUI } from "../../context/UIContext";
import { Plus, Trash2, Search, Filter, Users, X, Mail, Phone, ShieldCheck, Shield, User as UserIcon } from "lucide-react";
import { cn } from "../../utils/cn";

export const UsersManagement: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", role: "cashier", password: "" });
  
  const { setLoading: setGlobalLoading, showToast } = useUI();

  const fetchUsers = async () => {
    try {
      const response = await apiClient.get("/users");
      if (response.success && response.data) {
        setUsers(response.data);
      }
    } catch (error: any) {
      console.error(error);
      showToast(error.message || "Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      if ((user.role as string) === 'deleted') return false; // In SQL, deleted users are permanently removed, but check in case
      
      const userName = user.name?.toLowerCase() || "";
      const userEmail = user.email?.toLowerCase() || "";
      const searchLower = searchTerm.toLowerCase();

      const matchesSearch = userName.includes(searchLower) || userEmail.includes(searchLower);
      const matchesRole = roleFilter === "All" || user.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchTerm, roleFilter]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalLoading(true);
    try {
      const response = await apiClient.post("/users/create-staff", {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        role: formData.role,
        password: formData.password,
      });
      
      if (response.success) {
        setShowModal(false);
        setFormData({ name: "", email: "", phone: "", role: "cashier", password: "" });
        fetchUsers();
        showToast("User added successfully", "success");
      } else {
        showToast(response.message || "Failed to add user", "error");
      }
    } catch (error: any) {
      showToast(error.message || "Failed to add user", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const toggleUserStatus = async (user: UserProfile) => {
    if (user.role === 'admin' || user.role === 'super_admin') {
      showToast("Administrator accounts cannot be disabled", "error");
      return;
    }
    
    setGlobalLoading(true);
    try {
      const newStatus = user.status === 'suspended' ? 'active' : 'suspended';
      const response = await apiClient.patch(`/users/${user.uid}/status`, {
        status: newStatus,
        reason: "Status toggled by administrator"
      });
      
      if (response.success) {
        showToast(`User ${newStatus === 'active' ? 'enabled' : 'disabled'} successfully`, "success");
        fetchUsers();
      } else {
        showToast(response.message || "Failed to update user status", "error");
      }
    } catch (error: any) {
      showToast(error.message || "Failed to update user status", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (user.role === 'admin' || user.role === 'super_admin') {
      showToast("Administrator accounts cannot be deleted", "error");
      return;
    }

    if (!window.confirm(`Are you sure you want to permanently delete ${user.name}? This action cannot be undone.`)) return;

    setGlobalLoading(true);
    try {
      const response = await apiClient.delete(`/users/${user.uid}`);
      if (response.success) {
        showToast("User deleted successfully", "success");
        fetchUsers();
      } else {
        showToast(response.message || "Failed to delete user", "error");
      }
    } catch (error: any) {
      showToast(error.message || "Failed to delete user", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const updateUserRole = async (uid: string, newRole: UserRole) => {
    setGlobalLoading(true);
    try {
      // Find the user to get their other details
      const targetUser = users.find(u => u.uid === uid);
      if (!targetUser) throw new Error("User not found");
      
      const response = await apiClient.put(`/users/${uid}`, {
        name: targetUser.name,
        email: targetUser.email,
        phone: targetUser.phone,
        role: newRole
      });
      
      if (response.success) {
        showToast("Role updated successfully", "success");
        fetchUsers();
      } else {
        showToast(response.message || "Failed to update role", "error");
      }
    } catch (error: any) {
      showToast(error.message || "Failed to update role", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <ShieldCheck size={14} />;
      case 'kitchen': return <Shield size={14} />;
      case 'cashier': return <Shield size={14} />;
      default: return <UserIcon size={14} />;
    }
  };

  if (loading) return (
    <div className="h-64 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-dark tracking-tight">Users</h2>
          <p className="text-sm text-gray-500">Manage your system users and staff.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-primary text-white px-5 py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-primary-dark transition-colors shadow-sm font-semibold text-sm"
        >
          <Plus size={18} /> Add User
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search users..." 
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <select 
            className="pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm appearance-none min-w-[140px]"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="All">All Roles</option>
            <option value="admin">Admin</option>
            <option value="cashier">Cashier</option>
            <option value="kitchen">Kitchen</option>
            <option value="customer">Customer</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Mobile User Cards */}
        <div className="grid grid-cols-1 gap-4 p-4 md:hidden">
          {filteredUsers.length === 0 ? (
            <div className="p-12 text-center opacity-50">
              <Users className="mx-auto mb-2 text-gray-300" size={32} />
              <p className="text-sm font-semibold">No users found</p>
            </div>
          ) : (
            filteredUsers.map(user => (
              <div key={user.uid} className="bg-gray-50/50 p-4 rounded-xl border border-gray-100 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-dark">{user.name}</h4>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </div>
                  <span className={cn(
                    "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1",
                    (user.role === 'admin' || user.role === 'super_admin') ? "bg-dark text-white" : "bg-gray-200 text-gray-600"
                  )}>
                    {getRoleIcon(user.role)}
                    {user.role}
                  </span>
                </div>
                
                {user.phone && (
                  <p className="text-xs text-gray-500 flex items-center gap-1.5">
                    <Phone size={12} /> {user.phone}
                  </p>
                )}

                <div className="flex gap-2 pt-2 border-t border-gray-100 justify-end">
                  {user.role !== 'admin' && (
                    <>
                      <select 
                        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white outline-none focus:border-primary"
                        value={user.role}
                        onChange={(e) => updateUserRole(user.uid, e.target.value as UserRole)}
                      >
                        <option value="cashier">Cashier</option>
                        <option value="kitchen">Kitchen</option>
                        <option value="customer">Customer</option>
                      </select>

                      <button 
                        onClick={() => toggleUserStatus(user)}
                        className={cn(
                          "px-3 py-1 rounded text-xs font-semibold transition-colors",
                          user.status === 'suspended' 
                            ? "bg-green-500 text-white hover:bg-green-600" 
                            : "bg-red-500 text-white hover:bg-red-600"
                        )}
                      >
                        {user.status === 'suspended' ? "Enable" : "Disable"}
                      </button>

                      <button 
                        onClick={() => handleDeleteUser(user)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100 text-xs font-semibold text-gray-500">
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Phone</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center opacity-50">
                    <Users className="mx-auto mb-2 text-gray-300" size={32} />
                    <p className="text-sm font-semibold">No users found</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.uid} className="hover:bg-gray-50/20 transition-colors">
                    <td className="px-6 py-4 font-semibold text-dark">{user.name}</td>
                    <td className="px-6 py-4 text-gray-500">{user.email}</td>
                    <td className="px-6 py-4 text-gray-500">{user.phone || "—"}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider",
                        (user.role === 'admin' || user.role === 'super_admin') ? "bg-dark text-white" : "bg-gray-100 text-gray-600"
                      )}>
                        {getRoleIcon(user.role)}
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider",
                        user.status === 'suspended' ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                      )}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", user.status === 'suspended' ? "bg-red-500" : "bg-green-500")} />
                        {user.status === 'suspended' ? "Disabled" : "Active"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {user.role !== 'admin' && (
                        <div className="flex items-center justify-end gap-3">
                          <select 
                            className="text-xs border border-gray-200 rounded px-2.5 py-1.5 bg-white outline-none focus:border-primary font-medium"
                            value={user.role}
                            onChange={(e) => updateUserRole(user.uid, e.target.value as UserRole)}
                          >
                            <option value="cashier">Cashier</option>
                            <option value="kitchen">Kitchen</option>
                            <option value="customer">Customer</option>
                          </select>

                          <button 
                            onClick={() => toggleUserStatus(user)}
                            className={cn(
                              "px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider border transition-all active:scale-[0.98]",
                              user.status === 'suspended'
                                ? "bg-green-50 text-green-600 border-green-200 hover:bg-green-100"
                                : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                            )}
                          >
                            {user.status === 'suspended' ? "Enable" : "Disable"}
                          </button>

                          <button 
                            onClick={() => handleDeleteUser(user)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-100">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-dark flex items-center gap-2">
                <Plus size={20} className="text-primary" /> Add System User
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-dark">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateUser}>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600 ml-1">Full Name</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="John Doe"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-medium"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600 ml-1">Email Address</label>
                  <input 
                    type="email" 
                    required 
                    placeholder="email@example.com"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-medium"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600 ml-1">Phone Number</label>
                  <input 
                    type="tel" 
                    placeholder="+234 ..."
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-medium"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600 ml-1">Role</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-semibold"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="admin">Admin</option>
                    <option value="cashier">Cashier</option>
                    <option value="kitchen">Kitchen</option>
                    <option value="customer">Customer</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600 ml-1">Password</label>
                  <input 
                    type="password" 
                    required 
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-medium"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
              </div>

              <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-3 justify-end">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-white border border-gray-200 text-gray-500 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-primary text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-primary-dark transition-colors shadow-sm"
                >
                  Add User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
