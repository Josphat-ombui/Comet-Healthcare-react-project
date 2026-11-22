export const PERMISSIONS = Object.freeze({
  'identity.user.read': 'Read users',
  'identity.user.write': 'Create or update users',
  'identity.user.disable': 'Disable users',
  'identity.group.read': 'Read groups',
  'identity.group.write': 'Manage groups',
  'identity.role.read': 'Read roles',
  'identity.role.write': 'Manage roles and permissions',
  'identity.apikey.write': 'Manage API keys',
  'org.branch.read': 'Read branches',
  'org.branch.write': 'Manage branches',
  'org.department.read': 'Read departments',
  'org.department.write': 'Manage departments',
  'org.title.write': 'Manage job titles',
  'messaging.inbox.read': 'Read inboxes',
  'messaging.thread.write': 'Create and update threads',
  'messaging.thread.assign': 'Assign shared-inbox threads',
  'messaging.message.send': 'Send messages',
  'messaging.message.recall': 'Recall messages',
  'audit.read': 'Read the audit log',
  'audit.verify': 'Verify the audit hash chain',
})

export const ROLE_PERMISSIONS = Object.freeze({
  ADMIN: Object.keys(PERMISSIONS),
  MANAGER: [
    'identity.user.read',
    'identity.group.read',
    'identity.role.read',
    'org.branch.read',
    'org.department.read',
    'messaging.inbox.read',
    'messaging.thread.write',
    'messaging.thread.assign',
    'messaging.message.send',
  ],
  STAFF: [
    'messaging.inbox.read',
    'messaging.thread.write',
    'messaging.message.send',
  ],
  COMPLIANCE: ['audit.read', 'audit.verify', 'identity.user.read', 'messaging.inbox.read'],
})

export function hasPermission(roles, permission) {
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission))
}
