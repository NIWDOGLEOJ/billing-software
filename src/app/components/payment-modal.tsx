import { useState } from 'react';
import { CreditCard, Banknote, Smartphone, X, Check } from 'lucide-react';
import { CartItem } from './pos-system';

interface PaymentModalProps {
  cart: CartItem[];
  onClose: () => void;
  onComplete: () => void;
}

type PaymentMethod = 'cash' | 'card' | 'digital';

const TAX_RATE = 0.08;

export function PaymentModal({ cart, onClose, onComplete }: PaymentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [completed, setCompleted] = useState(false);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  const cashAmount = parseFloat(cashReceived) || 0;
  const change = cashAmount - total;

  const handleComplete = () => {
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      setCompleted(true);
      setTimeout(() => {
        onComplete();
      }, 1500);
    }, 1000);
  };

  const canComplete = () => {
    if (paymentMethod === 'cash') {
      return cashAmount >= total;
    }
    return true;
  };

  if (completed) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Payment Successful!</h2>
          <p className="text-gray-600">Transaction completed successfully</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Payment</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* Order Summary */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold mb-3">Order Summary</h3>
          <div className="space-y-2 text-sm mb-3">
            {cart.map((item) => (
              <div key={item.id} className="flex justify-between">
                <span className="text-gray-600">
                  {item.name} x {item.quantity}
                </span>
                <span>${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-2 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tax</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg pt-1 border-t">
              <span>Total</span>
              <span className="text-blue-600">${total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Payment Method Selection */}
        <div className="mb-6">
          <h3 className="font-semibold mb-3">Payment Method</h3>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setPaymentMethod('cash')}
              className={`p-4 rounded-lg border-2 transition-all ${
                paymentMethod === 'cash'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Banknote size={24} className="mx-auto mb-2" />
              <p className="text-sm font-medium">Cash</p>
            </button>
            <button
              onClick={() => setPaymentMethod('card')}
              className={`p-4 rounded-lg border-2 transition-all ${
                paymentMethod === 'card'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <CreditCard size={24} className="mx-auto mb-2" />
              <p className="text-sm font-medium">Card</p>
            </button>
            <button
              onClick={() => setPaymentMethod('digital')}
              className={`p-4 rounded-lg border-2 transition-all ${
                paymentMethod === 'digital'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Smartphone size={24} className="mx-auto mb-2" />
              <p className="text-sm font-medium">Digital</p>
            </button>
          </div>
        </div>

        {/* Cash Payment Input */}
        {paymentMethod === 'cash' && (
          <div className="mb-6">
            <label className="block font-semibold mb-2">Cash Received</label>
            <input
              type="number"
              step="0.01"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
              placeholder="Enter amount"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
            />
            {cashAmount >= total && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex justify-between font-semibold">
                  <span className="text-green-700">Change:</span>
                  <span className="text-green-700 text-lg">${change.toFixed(2)}</span>
                </div>
              </div>
            )}
            {cashAmount > 0 && cashAmount < total && (
              <p className="mt-2 text-red-500 text-sm">
                Insufficient amount. Need ${(total - cashAmount).toFixed(2)} more
              </p>
            )}
          </div>
        )}

        {/* Card Payment */}
        {paymentMethod === 'card' && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <CreditCard size={32} className="mx-auto mb-2 text-blue-600" />
            <p className="text-sm text-gray-700">Insert or tap card to continue</p>
          </div>
        )}

        {/* Digital Payment */}
        {paymentMethod === 'digital' && (
          <div className="mb-6 bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
            <Smartphone size={32} className="mx-auto mb-2 text-purple-600" />
            <p className="text-sm text-gray-700">Scan QR code or use digital wallet</p>
          </div>
        )}

        {/* Complete Payment Button */}
        <button
          onClick={handleComplete}
          disabled={!canComplete() || processing}
          className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? 'Processing...' : 'Complete Payment'}
        </button>
      </div>
    </div>
  );
}
