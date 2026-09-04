import { useState, useEffect } from 'react';
import { useAuth, User, Permission } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { api } from '../utils/api';
import { Plus, Edit2, Trash2, UserCheck, UserX, Save, X, Eye, EyeOff, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { updatePointerGlare, SpecularGlareOverlay } from '../utils/glare';
import { Skeleton } from './ui/skeleton';
import { PageShell, PageHeader } from './page-shell';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

const ALL_PERMISSIONS: { value: Permission; label: string; description: string }[] = [
  { value: 'access_billing', label: 'Access Billing System', description: 'Can access the billing interface' },
  { value: 'edit_product_price', label: 'Edit Product Price', description: 'Can modify product prices during checkout' },
  { value: 'delete_bill_items', label: 'Delete Bill Items', description: 'Can remove items from bills' },
  { value: 'apply_discounts', label: 'Apply Discounts', description: 'Can apply discounts to bills' },
  { value: 'view_analytics', label: 'View Analytics', description: 'Can access sales analytics dashboard' },
  { value: 'access_inventory', label: 'Access Inventory', description: 'Can manage inventory' },
  { value: 'view_transaction_history', label: 'View Transaction History', description: 'Can view bill history' },
  { value: 'generate_reports', label: 'Generate Reports', description: 'Can create and export reports' },
  { value: 'access_settings', label: 'Access Settings', description: 'Can access system settings' },
];

export function EmployeeManagement() {
  const { isOwner } = useAuth();
  const { darkMode } = useTheme();
  const [employees, setEmployees] = useState<User[]>([]);
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    phone: '',
    permissions: [] as Permission[],
  });

  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Distinguishes "still fetching" from "genuinely no employees" — the list used
  // to render the empty state during the initial load, which read as data loss.
  const [isLoading, setIsLoading] = useState(true);
  const [employeeToDelete, setEmployeeToDelete] = useState<User | null>(null);

  useEffect(() => {
    if (isOwner()) {
      loadEmployees();
    } else {
      setIsLoading(false);
    }
  }, [isOwner]);

  const loadEmployees = async () => {
    try {
      const users = await api.get<any[]>('/users');
      setEmployees(users.filter(u => u.role === 'employee').map(u => ({
        id: u.id,
        username: u.username,
        email: u.email || '',
        name: u.name,
        role: u.role,
        permissions: u.permissions || [],
        phone: u.phone || '',
        createdAt: u.created_at || '',
        isActive: u.is_active
      })));
    } catch (e: any) {
      console.error('Failed to load employees:', e);
      toast.error(`Couldn't load employees: ${e?.message || 'Server unreachable'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadEmployeesCsv = () => {
    if (employees.length === 0) {
      toast.error('No employee records to export.');
      return;
    }

    const headers = ['Employee ID', 'Username', 'Full Name', 'Email Address', 'Phone Number', 'Role', 'Status', 'Permissions', 'Created At'];
    const rows = employees.map(u => [
      u.id, 
      u.username || '', 
      u.name || '', 
      u.email || '', 
      u.phone || '', 
      u.role || 'employee', 
      u.isActive === 1 || u.isActive === true ? 'Active' : 'Inactive', 
      u.permissions ? (typeof u.permissions === 'string' ? JSON.parse(u.permissions).join('; ') : u.permissions.join('; ')) : '',
      u.createdAt || ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.map(val => {
      if (typeof val === 'string') {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Employee_Database_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      username: '',
      email: '',
      password: '',
      phone: '',
      permissions: [],
    });
    setIsAddingEmployee(false);
    setEditingEmployee(null);
    setShowPassword(false);
    setErrorMessage(null);
  };

  const handleSaveEmployee = async () => {
    setErrorMessage(null);

    // Client-side validation
    if (!formData.name.trim()) return setErrorMessage('Full name is required.');
    if (!formData.username.trim()) return setErrorMessage('Username is required.');
    if (!editingEmployee && !formData.password) return setErrorMessage('Password is required for new employees.');

    try {
      if (editingEmployee) {
        await api.put(`/users/${editingEmployee.id}`, {
          name: formData.name,
          username: formData.username,
          email: formData.email,
          phone: formData.phone,
          permissions: formData.permissions,
        });
        if (formData.password) {
          await api.put(`/users/${editingEmployee.id}/password`, {
            password: formData.password
          });
        }
      } else {
        const newId = `emp_${Date.now()}`;
        await api.post('/users', {
          id: newId,
          name: formData.name,
          username: formData.username,
          email: formData.email || null,
          phone: formData.phone || null,
          role: 'employee',
          password: formData.password,
          permissions: formData.permissions,
        });
      }
      await loadEmployees();
      resetForm();
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to save employee. Please try again.');
    }
  };

  const handleEditEmployee = (employee: User) => {
    setEditingEmployee(employee);
    setFormData({
      name: employee.name,
      username: employee.username,
      email: employee.email,
      password: '',
      phone: employee.phone || '',
      permissions: employee.permissions,
    });
    setIsAddingEmployee(true);
  };

  const handleToggleActive = async (employee: User) => {
    const nextActive = !employee.isActive;
    try {
      await api.put(`/users/${employee.id}`, {
        is_active: nextActive
      });
      await loadEmployees();
      toast.success(`${employee.name} ${nextActive ? 'activated' : 'deactivated'}`);
    } catch (e: any) {
      console.error('Failed to toggle active status:', e);
      toast.error(`Couldn't update ${employee.name}: ${e?.message || 'Server error'}`);
    }
  };

  const handleDeleteEmployee = async (employee: User) => {
    try {
      await api.delete(`/users/${employee.id}`);
      await loadEmployees();
      toast.success(`${employee.name} deleted`);
    } catch (e: any) {
      console.error('Failed to delete employee:', e);
      toast.error(`Couldn't delete ${employee.name}: ${e?.message || 'Server error'}`);
    } finally {
      setEmployeeToDelete(null);
    }
  };

  const togglePermission = (permission: Permission) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission],
    }));
  };

  if (!isOwner()) {
    return (
      <PageShell>
        <div className="bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-xl p-6 text-center text-[var(--danger)] font-bold">
          <p>
            Access Denied. Only owners can manage employees.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Employee Management"
        description="Manage employee accounts and permissions"
        actions={
          <>
            <button
              onClick={downloadEmployeesCsv}
              className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] font-medium text-sm rounded-lg transition-all active:scale-[0.97] cursor-pointer"
            >
              <FileSpreadsheet size={18} />
              Export CSV
            </button>
            <button
              onClick={() => setIsAddingEmployee(true)}
              className="liquid-glass-button flex items-center gap-2 px-4 py-2.5 text-white font-medium text-sm rounded-lg transition-all shadow-sm active:scale-[0.97] cursor-pointer"
            >
              <Plus size={18} />
              Add Employee
            </button>
          </>
        }
      />

      {/* Scrollable Content Container */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-2 min-h-0">
        {/* Add/Edit Employee Form */}
        {isAddingEmployee && (
          <div 
            onPointerMove={updatePointerGlare}
            className="group relative glass-panel backdrop-blur-xl backdrop-saturate-200 border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] p-6 mb-2 overflow-hidden"
          >
            <SpecularGlareOverlay />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6 pb-3 border-b border-[var(--border-glass)] shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6)]">
                <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                  {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
                </h2>
                <button
                  onClick={resetForm}
                  className="p-2 hover:bg-[var(--input-bg)] text-muted-foreground hover:text-[var(--text-primary)] rounded-lg transition-all active:scale-[0.97] cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

            {/* Inline Error Banner */}
            {errorMessage && (
              <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-lg border bg-rose-500/10 border-rose-500/30 text-rose-500">
                <span className="text-lg leading-none mt-0.5">⚠️</span>
                <div>
                  <p className="text-sm font-semibold">Could not save employee</p>
                  <p className="text-sm mt-0.5">{errorMessage}</p>
                </div>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="ml-auto opacity-60 hover:opacity-100 transition-opacity text-lg leading-none"
                >×</button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-accent)]"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Username *
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-4 py-2 border border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-accent)]"
                  placeholder="johndoe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-accent)]"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-accent)]"
                  placeholder="+1 234 567 8900"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Password {editingEmployee && '(leave blank to keep current)'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 pr-12 border border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-accent)]"
                    placeholder={editingEmployee ? 'Enter new password' : 'Enter password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPassword ? (
                      <EyeOff size={20} className="text-muted-foreground" />
                    ) : (
                      <Eye size={20} className="text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Permissions */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
                Permissions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ALL_PERMISSIONS.map((perm) => (
                  <label
                    key={perm.value}
                    className={`flex items-start p-4 border rounded-lg cursor-pointer transition-colors ${
                      formData.permissions.includes(perm.value)
                        ? 'bg-[var(--primary-accent)]/15 border-[var(--primary-accent)] text-[var(--text-primary)] shadow-sm'
                        : 'bg-[var(--input-bg)] border-[var(--border-glass)] text-[var(--text-primary)] hover:border-slate-400/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.permissions.includes(perm.value)}
                      onChange={() => togglePermission(perm.value)}
                      className="mt-1 mr-3 w-4 h-4 text-[var(--primary-accent)] border-[var(--border-glass)] rounded focus:ring-[var(--primary-accent)]"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-[var(--text-primary)]">
                        {perm.label}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {perm.description}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleSaveEmployee}
                disabled={!formData.name || !formData.username || !formData.email || (!editingEmployee && !formData.password)}
                className="liquid-glass-button text-white flex items-center gap-2 px-6 py-3 font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md active:scale-[0.97] cursor-pointer"
              >
                <Save size={20} />
                {editingEmployee ? 'Update Employee' : 'Add Employee'}
              </button>
              <button
                onClick={resetForm}
                className="px-6 py-3 border border-[var(--border-glass)] bg-[var(--input-bg)] text-[var(--text-primary)] hover:bg-[var(--bg-glass)] font-medium rounded-lg transition-all active:scale-[0.97] cursor-pointer shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Employee List */}
        <div className="grid grid-cols-1 gap-4 pr-1">
          {isLoading ? (
            // Placeholder cards matched to the real row height, so the list
            // doesn't jump when the data lands.
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="glass-panel border-[var(--border-glass)] rounded-xl shadow-sm p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-64" />
                    <div className="flex gap-2 pt-1">
                      <Skeleton className="h-5 w-24 rounded-full" />
                      <Skeleton className="h-5 w-28 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <Skeleton className="h-9 w-9 rounded-lg" />
                  </div>
                </div>
              </div>
            ))
          ) : employees.length === 0 ? (
            <div className="glass-panel border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-sm p-12 text-center">
              <p className="text-muted-foreground">
                No employees yet. Click "Add Employee" to get started.
              </p>
            </div>
          ) : (
            employees.map((employee) => (
              <div
                key={employee.id}
                onPointerMove={updatePointerGlare}
                className="group relative glass-panel backdrop-blur-xl backdrop-saturate-200 border-[var(--border-glass)] text-[var(--text-primary)] rounded-xl shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),var(--shadow-glass)] p-6 overflow-hidden transition-all hover:-translate-y-1 hover:border-[var(--primary-accent)]/40"
              >
                <SpecularGlareOverlay />
                <div className="relative z-10 flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-[var(--text-primary)]">
                        {employee.name}
                      </h3>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          employee.isActive
                            ? 'bg-emerald-500/20 text-emerald-500'
                            : 'bg-rose-500/20 text-rose-500'
                        }`}
                      >
                        {employee.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="space-y-1 mb-4">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-[var(--text-primary)]">Username:</span> {employee.username}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-[var(--text-primary)]">Email:</span> {employee.email}
                      </p>
                      {employee.phone && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-[var(--text-primary)]">Phone:</span> {employee.phone}
                        </p>
                      )}
                    </div>

                    {/* Permissions */}
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)] mb-2">
                        Permissions:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {employee.permissions.length === 0 ? (
                          <span className="text-sm text-muted-foreground">
                            No permissions assigned
                          </span>
                        ) : (
                          employee.permissions.map((perm) => {
                            const permData = ALL_PERMISSIONS.find(p => p.value === perm);
                            return (
                              <span
                                key={perm}
                                className="px-3 py-1 bg-[var(--primary-accent)]/15 border border-[var(--primary-accent)]/30 text-[var(--primary-accent)] rounded-full text-xs font-medium"
                              >
                                {permData?.label || perm}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleEditEmployee(employee)}
                      className="p-2 border border-[var(--border-glass)] bg-[var(--input-bg)] hover:bg-[var(--bg-glass)] text-[var(--text-primary)] rounded-lg transition-all active:scale-[0.97] cursor-pointer shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6)]"
                      title="Edit"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(employee)}
                      className={`p-2 rounded-lg transition-all active:scale-[0.97] cursor-pointer border ${
                        employee.isActive
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20'
                      }`}
                      title={employee.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {employee.isActive ? (
                        <UserX size={18} />
                      ) : (
                        <UserCheck size={18} />
                      )}
                    </button>
                    <button
                      onClick={() => setEmployeeToDelete(employee)}
                      className="p-2 bg-rose-500/10 border border-rose-500/30 text-rose-500 hover:bg-rose-500/20 rounded-lg transition-all active:scale-[0.97] cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <AlertDialog
        open={employeeToDelete !== null}
        onOpenChange={(open) => { if (!open) setEmployeeToDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {employeeToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the account and revokes their access. Bills
              they already rang up are kept. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (employeeToDelete) handleDeleteEmployee(employeeToDelete); }}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Delete employee
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

