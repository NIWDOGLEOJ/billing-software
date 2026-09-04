import { StoreConfig } from '../types/product';

export const STORE_CONFIG: StoreConfig = {
  name: "J MART",
  tagline: "Your Neighbourhood Supermarket & Daily Essentials Store",
  description: "Browse our live in-store catalog to check availability before visiting or reserve items directly for quick in-store pickup.",
  address: "Rayala Nagar Extension, near Koilpillai School, Ramapuram",
  cityStateZip: "Chennai, Tamil Nadu 600089",
  phone: "+91 77088 00220",
  whatsappNumber: "917708800220",
  email: "contact@jmart.store",
  mapsUrl: "https://maps.google.com/?q=J+MART+Rayala+Nagar+Extension+Ramapuram+Chennai+600089",
  openingHours: {
    weekdays: "8:00 AM – 10:00 PM",
    weekends: "8:00 AM – 10:30 PM",
    statusText: "Open Now • Closes at 10:00 PM"
  },
  features: {
    enableWhatsAppOrder: true,
    showExactStockCount: true,
    enableInStorePickup: true,
    currencySymbol: "₹"
  }
};
