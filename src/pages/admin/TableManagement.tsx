import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  Users,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import {
  getTables,
  createTable,
  updateTable,
  deleteTable,
  regenerateQrToken,
} from '../../services/tableService';
import type { RestaurantTable } from '../../types';
import { TableQrCardModal } from '../../components/TableQrCardModal';

export const TableManagement: React.FC = () => {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal States
  const [selectedQrTable, setSelectedQrTable] = useState<RestaurantTable | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Form Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [formData, setFormData] = useState({
    table_number: '',
    label: '',
    capacity: 4,
    is_active: true,
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Copied token state
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const fetchTablesList = async () => {
    try {
      setLoading(true);
      const data = await getTables();
      setTables(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load restaurant tables.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTablesList();
  }, []);

  const handleOpenAddModal = () => {
    setEditingTable(null);
    // Auto suggest next table number
    const nextNum = String(tables.length + 1).padStart(2, '0');
    setFormData({
      table_number: `Table ${nextNum}`,
      label: '',
      capacity: 4,
      is_active: true,
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleOpenEditModal = (table: RestaurantTable) => {
    setEditingTable(table);
    setFormData({
      table_number: table.table_number,
      label: table.label || '',
      capacity: table.capacity || 4,
      is_active: Boolean(table.is_active),
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSubmitting(true);

    try {
      if (editingTable) {
        await updateTable(editingTable.id, formData);
        setSuccessMsg(`Updated ${formData.table_number} successfully.`);
      } else {
        await createTable(formData);
        setSuccessMsg(`Created ${formData.table_number} with new secure QR token.`);
      }
      setIsFormOpen(false);
      await fetchTablesList();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save table.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteTable = async (table: RestaurantTable) => {
    if (table.has_active_orders) {
      alert(`Cannot delete ${table.table_number} because it has active dining orders.`);
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${table.table_number}? This will permanently remove its QR token.`)) {
      return;
    }

    try {
      await deleteTable(table.id);
      setSuccessMsg(`Deleted ${table.table_number}.`);
      await fetchTablesList();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete table.');
    }
  };

  const handleOpenQrModal = (table: RestaurantTable) => {
    setSelectedQrTable(table);
    setIsQrModalOpen(true);
  };

  const handleRegenerateQrToken = async (tableId: number) => {
    if (!window.confirm('Resetting this token will invalidate any existing printed QR cards for this table. Continue?')) {
      return;
    }

    setIsRegenerating(true);
    try {
      const updated = await regenerateQrToken(tableId);
      setSuccessMsg(`Regenerated QR token for ${updated.table_number}.`);
      setSelectedQrTable(updated);
      await fetchTablesList();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'Failed to regenerate QR token.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleCopyLink = (token?: string) => {
    if (!token || token === 'undefined') return;
    const url = `${window.location.origin}/q/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const totalCapacity = tables.reduce((sum, t) => sum + (Number(t.capacity) || 0), 0);
  const activeTablesCount = tables.filter((t) => t.is_active).length;
  const activeOrdersTables = tables.filter((t) => t.has_active_orders).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight font-serif">
              Table & QR Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[#FEF5F5] border border-[#F4C4C4] text-[#8B1A1A] font-bold text-xs uppercase tracking-wide">
              Guest Dine-In
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Configure restaurant dining tables, generate high-resolution royal QR flyers, and monitor live guest dine-in activity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTablesList}
            disabled={loading}
            className="p-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            title="Refresh tables"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2.5 bg-[#8B1A1A] hover:bg-[#A52B2B] text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Table</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-emerald-800 text-xs font-semibold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-red-800 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total Tables</span>
            <QrCode className="w-4 h-4 text-[#8B1A1A]" />
          </div>
          <p className="text-2xl font-black text-gray-900">{tables.length}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{activeTablesCount} active on floor</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total Seats</span>
            <Users className="w-4 h-4 text-[#D4A017]" />
          </div>
          <p className="text-2xl font-black text-gray-900">{totalCapacity}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Dining floor capacity</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Active Dining</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="text-2xl font-black text-[#8B1A1A]">{activeOrdersTables}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Tables currently with orders</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Payment Mode</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-base font-black text-gray-900 pt-1">Flexible (Both)</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Pay Now or After Meal</p>
        </div>
      </div>

      {/* Tables List */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-sm text-gray-800">Dining Tables Floor Map</h2>
          <span className="text-xs text-gray-400">{tables.length} tables registered</span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-400">
            <div className="w-8 h-8 border-2 border-[#8B1A1A] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs font-semibold">Loading tables...</p>
          </div>
        ) : tables.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <QrCode className="w-12 h-12 mx-auto mb-3 text-gray-300 stroke-1" />
            <p className="font-bold text-sm text-gray-700">No tables configured yet</p>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
              Add your first dining table to start generating QR codes for guest table ordering.
            </p>
            <button
              onClick={handleOpenAddModal}
              className="mt-4 px-4 py-2 bg-[#8B1A1A] text-white text-xs font-bold rounded-xl shadow-xs"
            >
              Add First Table
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50/80 text-gray-500 font-bold uppercase tracking-wider text-[10px] border-b border-gray-200">
                <tr>
                  <th className="px-5 py-3">Table Identifier</th>
                  <th className="px-4 py-3">Section / Label</th>
                  <th className="px-4 py-3">Seats</th>
                  <th className="px-4 py-3">QR Public Token</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Active Order</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tables.map((table) => {
                  const effectiveToken = table.qr_code_token || table.public_token || '';
                  const isCopied = copiedToken === effectiveToken;

                  return (
                    <tr key={table.id} className="hover:bg-gray-50/70 transition-colors">
                      {/* Table Identifier */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-[#FEF5F5] border border-[#F4C4C4] flex items-center justify-center font-bold text-xs text-[#8B1A1A]">
                            {table.table_number.replace(/[^0-9]/g, '') || '#'}
                          </div>
                          <div>
                            <span className="font-bold text-gray-900 block text-xs">
                              {table.table_number}
                            </span>
                            <span className="text-[10px] text-gray-400">ID #{table.id}</span>
                          </div>
                        </div>
                      </td>

                      {/* Section / Label */}
                      <td className="px-4 py-3.5 text-gray-600 font-medium">
                        {table.label || table.name || <span className="text-gray-300 italic">Main Dining</span>}
                      </td>

                      {/* Capacity */}
                      <td className="px-4 py-3.5 text-gray-700">
                        <span className="font-semibold">{table.capacity ?? 4}</span> seats
                      </td>

                      {/* QR Public Token */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 font-mono text-[11px] bg-gray-100 px-2 py-1 rounded-lg border border-gray-200 w-fit">
                          <span className="text-gray-700 font-bold">{effectiveToken || 'Generating...'}</span>
                          {effectiveToken && (
                            <button
                              onClick={() => handleCopyLink(effectiveToken)}
                              className="text-gray-400 hover:text-gray-700 transition-colors ml-1"
                              title="Copy Direct QR Link"
                            >
                              {isCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        {table.is_active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200">
                            <XCircle className="w-3 h-3" />
                            Disabled
                          </span>
                        )}
                      </td>

                      {/* Active Order */}
                      <td className="px-4 py-3.5">
                        {table.has_active_orders ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                            Active Orders ({table.active_orders_count || 1})
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400">Free</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {effectiveToken && (
                            <button
                              onClick={() => window.open(`/q/${effectiveToken}`, '_blank')}
                              className="p-1.5 rounded-lg text-gray-600 hover:text-[#8B1A1A] hover:bg-amber-50 border border-gray-200 transition-colors"
                              title="Test / Open Guest Menu for this Table"
                            >
                              <ExternalLink className="w-4 h-4 text-gray-600" />
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenQrModal(table)}
                            className="p-1.5 rounded-lg text-gray-600 hover:text-[#8B1A1A] hover:bg-[#FEF5F5] border border-gray-200 transition-colors"
                            title="View / Print Royal QR Stand Card"
                          >
                            <QrCode className="w-4 h-4 text-[#8B1A1A]" />
                          </button>

                          <button
                            onClick={() => handleOpenEditModal(table)}
                            className="p-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200 transition-colors"
                            title="Edit Table"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteTable(table)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 border border-gray-200 transition-colors"
                            title="Delete Table"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Table Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-100 animate-in fade-in zoom-in duration-150">
            <h3 className="font-serif font-bold text-lg text-gray-900 mb-1">
              {editingTable ? `Edit ${editingTable.table_number}` : 'Add New Restaurant Table'}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Enter table identifiers. A cryptographically unique QR token will be assigned automatically.
            </p>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Table Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Table 07, Table VIP-1"
                  value={formData.table_number}
                  onChange={(e) => setFormData({ ...formData, table_number: e.target.value })}
                  className="w-full text-xs px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#8B1A1A] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Section / Label (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Terrace, Window Side, VIP Booth"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  className="w-full text-xs px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#8B1A1A] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Seating Capacity
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
                  className="w-full text-xs px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:border-[#8B1A1A] focus:bg-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="is_active_toggle"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-[#8B1A1A] rounded border-gray-300 focus:ring-[#8B1A1A]"
                />
                <label htmlFor="is_active_toggle" className="text-xs font-semibold text-gray-700">
                  Enable QR table ordering for this table
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 bg-[#8B1A1A] hover:bg-[#A52B2B] text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  {formSubmitting ? 'Saving...' : editingTable ? 'Save Changes' : 'Create Table'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Royal QR Stand Card Flyer Modal */}
      <TableQrCardModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        table={selectedQrTable}
        onRegenerateToken={handleRegenerateQrToken}
        isRegenerating={isRegenerating}
      />
    </div>
  );
};
