import { useState, useRef } from 'react';
import { X, Upload, Download, Save, Store, User, DollarSign } from 'lucide-react';
import { ShopDetails } from './cashier-billing';

interface Product {
  code: string;
  name: string;
  price: number;
  category: string;
}

interface SettingsModalProps {
  products: Product[];
  shopDetails: ShopDetails;
  cashierName: string;
  gstRate: number;
  onUpdateProducts: (products: Product[]) => void;
  onUpdateShopDetails: (details: ShopDetails) => void;
  onUpdateCashierName: (name: string) => void;
  onUpdateGstRate: (rate: number) => void;
  onClose: () => void;
}

export function SettingsModal({
  products,
  shopDetails,
  cashierName,
  gstRate,
  onUpdateProducts,
  onUpdateShopDetails,
  onUpdateCashierName,
  onUpdateGstRate,
  onClose,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'products' | 'shop' | 'cashier' | 'gst'>('products');
  const [tempShopDetails, setTempShopDetails] = useState(shopDetails);
  const [tempCashierName, setTempCashierName] = useState(cashierName);
  const [tempGstRate, setTempGstRate] = useState(gstRate);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter((line) => line.trim());
        
        if (lines.length === 0) {
          setUploadError('File is empty');
          return;
        }

        // Check if first line is header
        const hasHeader = lines[0].toLowerCase().includes('code') || 
                         lines[0].toLowerCase().includes('name');
        const dataLines = hasHeader ? lines.slice(1) : lines;

        const newProducts: Product[] = dataLines.map((line, index) => {
          const parts = line.split(',').map((p) => p.trim());
          
          if (parts.length < 3) {
            throw new Error(`Line ${index + 1}: Invalid format. Need: code,name,price,category`);
          }

          return {
            code: parts[0] || `${1000 + index}`,
            name: parts[1] || 'Unnamed Product',
            price: parseFloat(parts[2]) || 0,
            category: parts[3] || 'General',
          };
        }).filter(p => p.code && p.name && p.price > 0);

        if (newProducts.length === 0) {
          setUploadError('No valid products found in file');
          return;
        }

        onUpdateProducts(newProducts);
        setUploadError('');
        alert(`Successfully uploaded ${newProducts.length} products!`);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Error reading file');
      }
    };

    reader.onerror = () => {
      setUploadError('Error reading file');
    };

    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownloadTemplate = () => {
    const template = `code,name,price,category
1001,Product 1,100,Category A
1002,Product 2,200,Category B
1003,Product 3,150,Category A`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCurrentProducts = () => {
    const csv = `code,name,price,category\n${products
      .map((p) => `${p.code},${p.name},${p.price},${p.category}`)
      .join('\n')}`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'current_products.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveShopDetails = () => {
    onUpdateShopDetails(tempShopDetails);
    alert('Shop details saved successfully!');
  };

  const handleSaveCashierName = () => {
    onUpdateCashierName(tempCashierName);
    alert('Cashier name saved successfully!');
  };

  const handleSaveGstRate = () => {
    onUpdateGstRate(tempGstRate);
    alert('GST rate saved successfully!');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('products')}
            className={`flex-1 px-6 py-3 font-medium transition-colors ${
              activeTab === 'products'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Products
          </button>
          <button
            onClick={() => setActiveTab('shop')}
            className={`flex-1 px-6 py-3 font-medium transition-colors ${
              activeTab === 'shop'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Shop Details
          </button>
          <button
            onClick={() => setActiveTab('cashier')}
            className={`flex-1 px-6 py-3 font-medium transition-colors ${
              activeTab === 'cashier'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Cashier
          </button>
          <button
            onClick={() => setActiveTab('gst')}
            className={`flex-1 px-6 py-3 font-medium transition-colors ${
              activeTab === 'gst'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            GST
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Products Tab */}
          {activeTab === 'products' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Upload Product List</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Upload a CSV file with your product list. Format: code, name, price, category
                </p>

                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  <div className="flex gap-3">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      <Upload size={20} />
                      Upload CSV File
                    </button>
                    <button
                      onClick={handleDownloadTemplate}
                      className="flex items-center gap-2 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      <Download size={20} />
                      Template
                    </button>
                  </div>

                  {uploadError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                      {uploadError}
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="font-medium text-sm mb-2">CSV Format Instructions:</p>
                    <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                      <li>First line can be header (optional): code,name,price,category</li>
                      <li>Each product on a new line</li>
                      <li>Example: 1001,Milk 1L,65,Dairy</li>
                      <li>Price should be in Rupees (without ₹ symbol)</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">
                    Current Products ({products.length})
                  </h3>
                  <button
                    onClick={handleDownloadCurrentProducts}
                    className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
                  >
                    <Download size={16} />
                    Export
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-3">Code</th>
                        <th className="text-left py-2 px-3">Name</th>
                        <th className="text-right py-2 px-3">Price</th>
                        <th className="text-left py-2 px-3">Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product, index) => (
                        <tr key={index} className="border-t hover:bg-gray-50">
                          <td className="py-2 px-3">{product.code}</td>
                          <td className="py-2 px-3">{product.name}</td>
                          <td className="py-2 px-3 text-right">₹{product.price.toFixed(2)}</td>
                          <td className="py-2 px-3">{product.category}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Shop Details Tab */}
          {activeTab === 'shop' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <Store size={24} className="text-blue-500" />
                <h3 className="text-lg font-semibold">Shop Information</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Shop Name</label>
                  <input
                    type="text"
                    value={tempShopDetails.name}
                    onChange={(e) =>
                      setTempShopDetails({ ...tempShopDetails, name: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter shop name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Address</label>
                  <input
                    type="text"
                    value={tempShopDetails.address}
                    onChange={(e) =>
                      setTempShopDetails({ ...tempShopDetails, address: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter shop address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Phone</label>
                  <input
                    type="text"
                    value={tempShopDetails.phone}
                    onChange={(e) =>
                      setTempShopDetails({ ...tempShopDetails, phone: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter phone number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    value={tempShopDetails.email}
                    onChange={(e) =>
                      setTempShopDetails({ ...tempShopDetails, email: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter email address"
                  />
                </div>

                <button
                  onClick={handleSaveShopDetails}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                >
                  <Save size={20} />
                  Save Shop Details
                </button>
              </div>
            </div>
          )}

          {/* Cashier Tab */}
          {activeTab === 'cashier' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <User size={24} className="text-blue-500" />
                <h3 className="text-lg font-semibold">Cashier Information</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Cashier Name</label>
                  <input
                    type="text"
                    value={tempCashierName}
                    onChange={(e) => setTempCashierName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter cashier name"
                  />
                </div>

                <button
                  onClick={handleSaveCashierName}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                >
                  <Save size={20} />
                  Save Cashier Name
                </button>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-6">
                  <p className="text-sm text-gray-600">
                    The cashier name will appear on all printed bills and receipts.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* GST Rate Tab */}
          {activeTab === 'gst' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <User size={24} className="text-blue-500" />
                <h3 className="text-lg font-semibold">GST Rate</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">GST Rate (%)</label>
                  <input
                    type="number"
                    value={tempGstRate}
                    onChange={(e) => setTempGstRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter GST rate"
                    min="0"
                    max="100"
                    step="0.01"
                  />
                </div>

                <button
                  onClick={handleSaveGstRate}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                >
                  <Save size={20} />
                  Save GST Rate
                </button>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-6">
                  <p className="text-sm text-gray-600">
                    The GST rate will be applied to all sales.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}