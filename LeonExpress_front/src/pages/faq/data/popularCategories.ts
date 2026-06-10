export interface Category {
  id: number
  icon: string
  name: string
  intro: string
}

const categories: Category[] = [
  {
    id: 1,
    icon: 'cube',
    name: 'Packages',
    intro: 'How to create, edit, and manage packages in the system.',
  },
  {
    id: 2,
    icon: 'navigate',
    name: 'Routes',
    intro: 'Plan and optimize delivery routes for your drivers.',
  },
  {
    id: 3,
    icon: 'car',
    name: 'Drivers',
    intro: 'Manage drivers, assign routes, and track performance.',
  },
  {
    id: 4,
    icon: 'cash',
    name: 'Payments',
    intro: 'Handle payments, invoices, and driver payouts.',
  },
  {
    id: 5,
    icon: 'people',
    name: 'Clients',
    intro: 'Manage client accounts, pricing, and invoicing preferences.',
  },
  {
    id: 6,
    icon: 'scan',
    name: 'QR Scanning',
    intro: 'Learn how to use the QR scanner for package verification.',
  },
]

export default categories
