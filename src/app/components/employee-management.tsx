import { useState, useEffect } from 'react';
import { useAuth, User, Permission } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { api } from '../utils/api';
import { Plus, Edit2, Trash2, UserCheck, UserX, Save, X, Eye, EyeOff, FileSpreadsheet } from 'lucide-react';

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

  useEffect(() => {
    if (isOwner()) {
      loadEmployees();
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
    } catch (e) {
      console.error('Failed to load employees:', e);
    }
  };

  const downloadEmployeesCsv = () => {
    if (employees.length === 0) {
      alert('No employee records to export.');
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
    try {
      await api.put(`/users/${employee.id}`, {
        is_active: !employee.isActive
      });
      await loadEmployees();
    } catch (e) {
      console.error('Failed to toggle active status:', e);
    }
  };

  const handleDeleteEmployee = async (employee: User) => {
    if (confirm(`Are you sure you want to permanently delete ${employee.name}?`)) {
      try {
        await api.delete(`/users/${employee.id}`);
        await loadEmployees();
      } catch (e) {
        console.error('Failed to delete employee:', e);
      }
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
      <div className={`p-8 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} h-full`}>
        <div className={`${darkMode ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'} border rounded-lg p-6 text-center`}>
          <p className={`${darkMode ? 'text-red-400' : 'text-red-700'}`}>
            Access Denied. Only owners can manage employees.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-8 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} h-full flex flex-col overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-shrink-0">
        <div>
          <h1 className={`text-4xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-2`}>
            Employee Management
          </h1>
          <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Manage employee accounts and permissions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={downloadEmployeesCsv}
            className={`flex items-center gap-2 px-5 py-3 ${
              darkMode ? 'bg-slate-800 hover:bg-slate-700 text-gray-200 border border-slate-700' : 'bg-white hover:bg-gray-55 text-gray-700 border border-gray-350'
            } font-medium rounded-lg transition-colors shadow-sm`}
          >
            <FileSpreadsheet size={20} />
            Export CSV
          </button>
          <button
            onClick={() => setIsAddingEmployee(true)}
            className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors shadow-sm"
          >
            <Plus size={20} />
            Add Employee
          </button>
        </div>
      </div>

      {/* Scrollable Content Container */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-2 min-h-0">
        {/* Add/Edit Employee Form */}
        {isAddingEmployee && (
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6 mb-2`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
              </h2>
              <button
                onClick={resetForm}
                className={`p-2 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
              >
                <X size={20} className={darkMode ? 'text-gray-400' : 'text-gray-600'} />
              </button>
            </div>

            {/* Inline Error Banner */}
            {errorMessage && (
              <div className={`mb-4 flex items-start gap-3 px-4 py-3 rounded-lg border ${
                darkMode
                  ? 'bg-red-900/20 border-red-700 text-red-400'
                  : 'bg-red-50 border-red-300 text-red-700'
              }`}>
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
                <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-4 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                  Username *
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className={`w-full px-4 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="johndoe"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={`w-full px-4 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className={`w-full px-4 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="+1 234 567 8900"
                />
              </div>

              <div className="md:col-span-2">
                <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                  Password {editingEmployee && '(leave blank to keep current)'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className={`w-full px-4 py-2 pr-12 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder={editingEmployee ? 'Enter new password' : 'Enter password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPassword ? (
                      <EyeOff size={20} className={darkMode ? 'text-gray-500' : 'text-gray-400'} />
                    ) : (
                      <Eye size={20} className={darkMode ? 'text-gray-500' : 'text-gray-400'} />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Permissions */}
            <div className="mb-6">
              <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-800'} mb-4`}>
                Permissions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ALL_PERMISSIONS.map((perm) => (
                  <label
                    key={perm.value}
                    className={`flex items-start p-4 border ${
                      formData.permissions.includes(perm.value)
                        ? darkMode
                          ? 'bg-blue-900/20 border-blue-500'
                          : 'bg-blue-50 border-blue-500'
                        : darkMode
                        ? 'bg-gray-700 border-gray-600'
                        : 'bg-gray-50 border-gray-300'
                    } rounded-lg cursor-pointer hover:border-blue-500 transition-colors`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.permissions.includes(perm.value)}
                      onChange={() => togglePermission(perm.value)}
                      className="mt-1 mr-3 w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                        {perm.label}
                      </p>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
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
                className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={20} />
                {editingEmployee ? 'Update Employee' : 'Add Employee'}
              </button>
              <button
                onClick={resetForm}
                className={`px-6 py-3 ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'} font-medium rounded-lg transition-colors`}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Employee List */}
        <div className="grid grid-cols-1 gap-4 pr-1">
          {employees.length === 0 ? (
            <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-12 text-center`}>
              <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                No employees yet. Click "Add Employee" to get started.
              </p>
            </div>
          ) : (
            employees.map((employee) => (
              <div
                key={employee.id}
                className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                        {employee.name}
                      </h3>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          employee.isActive
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}
                      >
                        {employee.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="space-y-1 mb-4">
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        <span className="font-medium">Username:</span> {employee.username}
                      </p>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        <span className="font-medium">Email:</span> {employee.email}
                      </p>
                      {employee.phone && (
                        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          <span className="font-medium">Phone:</span> {employee.phone}
                        </p>
                      )}
                    </div>

                    {/* Permissions */}
                    <div>
                      <p className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                        Permissions:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {employee.permissions.length === 0 ? (
                          <span className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                            No permissions assigned
                          </span>
                        ) : (
                          employee.permissions.map((perm) => {
                            const permData = ALL_PERMISSIONS.find(p => p.value === perm);
                            return (
                              <span
                                key={perm}
                                className={`px-3 py-1 ${darkMode ? 'bg-blue-900/20 text-blue-400' : 'bg-blue-100 text-blue-700'} rounded-full text-xs font-medium`}
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
                      className={`p-2 ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg transition-colors`}
                      title="Edit"
                    >
                      <Edit2 size={18} className={darkMode ? 'text-gray-300' : 'text-gray-600'} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(employee)}
                      className={`p-2 ${
                        employee.isActive
                          ? darkMode
                            ? 'bg-orange-900/20 hover:bg-orange-900/30'
                            : 'bg-orange-100 hover:bg-orange-200'
                          : darkMode
                          ? 'bg-green-900/20 hover:bg-green-900/30'
                          : 'bg-green-100 hover:bg-green-200'
                      } rounded-lg transition-colors`}
                      title={employee.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {employee.isActive ? (
                        <UserX size={18} className={darkMode ? 'text-orange-400' : 'text-orange-600'} />
                      ) : (
                        <UserCheck size={18} className={darkMode ? 'text-green-400' : 'text-green-600'} />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteEmployee(employee)}
                      className={`p-2 ${darkMode ? 'bg-red-900/20 hover:bg-red-900/30' : 'bg-red-100 hover:bg-red-200'} rounded-lg transition-colors`}
                      title="Delete"
                    >
                      <Trash2 size={18} className={darkMode ? 'text-red-400' : 'text-red-600'} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
