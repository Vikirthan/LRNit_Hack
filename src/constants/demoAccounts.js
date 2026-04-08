import { ROLES } from './roles'

export const DEMO_ACCOUNTS = {
  admin: {
    role: ROLES.ADMIN,
    label: 'Admin',
    name: 'Demo Admin',
    email: 'admin@demo.local',
    password: 'admin123',
    uid: 'demo-admin',
  },
  teacher: {
    role: ROLES.TEACHER,
    label: 'Teacher',
    name: 'Demo Teacher',
    email: 'teacher@demo.local',
    password: 'teacher123',
    uid: 'demo-teacher',
  },
  volunteer: {
    role: ROLES.VOLUNTEER,
    label: 'Volunteer',
    name: 'Demo Volunteer',
    email: 'volunteer@demo.local',
    password: 'volunteer123',
    uid: 'demo-volunteer',
  },
}