import { useState } from 'react';
import { X, Search, Eye, Calendar } from 'lucide-react';
import { SavedBill } from './cashier-billing';

interface BillHistoryModalProps {
  billHistory: SavedBill[];
  onViewBill: (bill: SavedBill) => void;
  onClose: () => void;
  darkMode?: boolean;
}

export function BillHistoryModal({
  billHistory,
  onViewBill,
  onClose,
  darkMode = false,
}: BillHistoryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredBills = billHistory.filter((bill) =>
    bill.billNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className={`rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border ${
          darkMode
            ? 'bg-gray-900 border-gray-700'
            : 'bg-white border-gray-200'
        }`}
      >
        {/* Header */}
        <div
          className={`flex justify-between items-center px-6 py-4 border-b ${
            darkMode ? 'border-gray-700' : 'border-gray-200'
          }`}
        >
          <div>
            <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Bill History
            </h2>
            <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {billHistory.length} {billHistory.length === 1 ? 'bill' : 'bills'} recorded
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode
                ? 'hover:bg-gray-700 text-gray-400 hover:text-white'
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
            }`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className={`px-6 py-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="relative">
            <Search
              className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                darkMode ? 'text-gray-500' : 'text-gray-400'
              }`}
              size={18}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by bill number..."
              className={`w-full pl-10 pr-4 py-2 rounded-lg text-sm border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                darkMode
                  ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
                  : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'
              }`}
            />
          </div>
        </div>

        {/* Bill List */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredBills.length === 0 ? (
            <div className={`text-center py-12 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
              <Calendar size={48} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">
                {billHistory.length === 0
                  ? 'No bills in history yet'
                  : `No bills found for "${searchQuery}"`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBills.map((bill) => (
                <div
                  key={bill.billNumber}
                  className={`rounded-xl border p-4 transition-all ${
                    darkMode
                      ? 'bg-gray-800 border-gray-700 hover:border-gray-600 hover:bg-gray-750'
                      : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className={`font-bold text-base ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {bill.billNumber}
                      </h3>
                      <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {formatDate(bill.date)}
                      </p>
                      <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        Cashier: {bill.cashierName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xl font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        ₹{bill.total.toFixed(2)}
                      </p>
                      <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        {bill.items.reduce((sum, item) => sum + item.quantity, 0)} items
                      </p>
                    </div>
                  </div>

                  {/* Items Preview */}
                  <div className={`border-t pt-3 mb-3 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                    <p className={`text-xs font-semibold mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Items:
                    </p>
                    <div className="space-y-1">
                      {bill.items.slice(0, 3).map((item, index) => (
                        <div key={index} className="flex justify-between text-xs">
                          <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                            {item.name} × {item.quantity}
                          </span>
                          <span className={`font-medium ${darkMode ? 'text-gray-300' : 'text-gray-800'}`}>
                            ₹{(item.price * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      ))}
                      {bill.items.length > 3 && (
                        <p className={`text-xs italic ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                          +{bill.items.length - 3} more items…
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => onViewBill(bill)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Eye size={16} />
                    View Full Bill
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`border-t px-6 py-3 ${
            darkMode
              ? 'bg-gray-800/60 border-gray-700'
              : 'bg-gray-50 border-gray-200'
          }`}
        >
          <div className={`flex justify-between items-center text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <span>Total Bills: <span className={`font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{billHistory.length}</span></span>
            <span>
              Total Revenue:{' '}
              <span className={`font-semibold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                ₹{billHistory.reduce((sum, bill) => sum + bill.total, 0).toFixed(2)}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
