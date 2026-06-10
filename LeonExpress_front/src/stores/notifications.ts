import { defineStore } from 'pinia'

export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    notifications: [
      { name: 'Searching for a job', isEnabled: true },
      { name: 'Hiring someone', isEnabled: false },
      { name: 'Connecting with others', isEnabled: true },
      { name: 'Posting and commenting', isEnabled: true },
      { name: 'Messaging', isEnabled: true },
      { name: 'Groups', isEnabled: false },
      { name: 'Pages', isEnabled: true },
      { name: 'Attending events', isEnabled: true },
      { name: 'News and reports', isEnabled: false },
      { name: 'Updating your profile', isEnabled: true },
      { name: 'Verifications', isEnabled: true },
    ],
  }),
})
