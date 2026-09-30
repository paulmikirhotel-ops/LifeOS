/**
 * Granular permission catalog + default role permission sets.
 * Memberships store the EFFECTIVE permission list (owner = ['*']).
 */

export const PERMISSIONS = {
  // tasks
  'tasks.view': 'View tasks',
  'tasks.create': 'Create tasks',
  'tasks.edit': 'Edit tasks',
  'tasks.delete': 'Delete tasks',
  // schedule & calendar
  'schedule.view': 'View schedule and calendar',
  'schedule.create': 'Create schedule blocks and events',
  'schedule.edit': 'Edit schedule blocks and events',
  'schedule.delete': 'Delete schedule blocks and events',
  // journal & notes
  'journal.view': 'View journal and shared notes',
  'journal.create': 'Write journal entries and notes',
  'journal.edit': 'Edit journal entries and notes',
  'journal.delete': 'Delete journal entries and notes',
  'journal.private': 'Access private journal entries of other members',
  // finance
  'finance.view': 'View income, expenses and categories',
  'finance.create': 'Record income and expenses',
  'finance.edit': 'Edit financial records',
  'finance.delete': 'Delete financial records',
  'finance.reports': 'View financial reports and audit log',
  // habits & goals
  'habits.view': 'View habits',
  'habits.create': 'Create habits',
  'habits.edit': 'Edit habits',
  'habits.delete': 'Delete habits',
  'goals.view': 'View goals',
  'goals.create': 'Create goals',
  'goals.edit': 'Edit goals',
  'goals.delete': 'Delete goals',
  // meetings
  'meetings.view': 'View meetings you organize or attend',
  'meetings.create': 'Schedule meetings',
  'meetings.edit': 'Run and edit meetings you organize',
  'meetings.delete': 'Delete meetings you organize',
  // users
  'users.view': 'View tenant members',
  'users.invite': 'Invite members',
  'users.manage': 'Manage members (roles, status)',
  // misc
  'analytics.view': 'View analytics and dashboard',
  'settings.manage': 'Manage tenant settings',
};

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS);

/** Owner = '*' means every permission; checked in requirePermission. */
export const ROLE_PERMISSIONS = {
  owner: ['*'],
  finance_manager: [
    'finance.view',
    'finance.create',
    'finance.edit',
    'finance.delete',
    'finance.reports',
    'users.view',
    'analytics.view',
  ],
  assistant: [
    'tasks.view',
    'tasks.create',
    'tasks.edit',
    'tasks.delete',
    'schedule.view',
    'schedule.create',
    'schedule.edit',
    'schedule.delete',
    'meetings.view',
    'meetings.create',
    'meetings.edit',
    'meetings.delete',
    'analytics.view',
  ],
  viewer: ['tasks.view', 'schedule.view', 'finance.view', 'meetings.view'],
};

export const TENANT_ROLES = Object.keys(ROLE_PERMISSIONS); // owner, finance_manager, assistant, viewer

/** Users without any tenant permission cannot exist in an org; personal tenant = owner. */
export function hasPermission(membershipPermissions, permission) {
  return membershipPermissions.includes('*') || membershipPermissions.includes(permission);
}
