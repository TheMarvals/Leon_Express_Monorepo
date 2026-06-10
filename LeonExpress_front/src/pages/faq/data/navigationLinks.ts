export interface NavItem {
  name: string
}

export interface NavSection {
  [section: string]: NavItem[]
}

const navigation: NavSection = {
  'Getting Started': [
    { name: 'Creating an account' },
    { name: 'Setting up your profile' },
    { name: 'Navigating the dashboard' },
    { name: 'Understanding permissions' },
  ],
  'Deliveries': [
    { name: 'Creating a new delivery' },
    { name: 'Assigning packages to routes' },
    { name: 'Tracking delivery status' },
    { name: 'Managing delivery notes' },
  ],
  'Routes': [
    { name: 'Planning a route' },
    { name: 'Assigning drivers' },
    { name: 'Optimizing route order' },
    { name: 'Viewing route history' },
  ],
  'Payments': [
    { name: 'Processing payments' },
    { name: 'Generating invoices' },
    { name: 'Driver payout calculations' },
    { name: 'Viewing payment history' },
  ],
  'Account': [
    { name: 'Changing your password' },
    { name: 'Updating email preferences' },
    { name: 'Managing API keys' },
    { name: 'Deleting your account' },
  ],
}

export default navigation
