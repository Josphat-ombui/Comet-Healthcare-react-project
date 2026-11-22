export const PERMISSIONS = Object.freeze({
  'identity.user.read': 'Read users',
  'identity.user.write': 'Create or update users',
  'org.branch.read': 'Read branches',
  'messaging.inbox.read': 'Read inboxes',
  'messaging.thread.write': 'Create and update threads',
  'messaging.thread.assign': 'Assign shared-inbox threads',
  'messaging.message.send': 'Send messages',
  'messaging.message.recall': 'Recall messages',
  'audit.read': 'Read the audit log'
})

export const ROLE_PERMISSIONS = Object.freeze({
  ADMIN: Object.keys(PERMISSIONS),
  MANAGER: [
    'identity.user.read',
    'org.branch.read',
    'messaging.inbox.read',
    'messaging.thread.write',
    'messaging.thread.assign',
    'messaging.message.send'
  ],
  STAFF: [
    'messaging.inbox.read',
    'messaging.thread.write',
    'messaging.message.send'
  ],
  COMPLIANCE: ['audit.read', 'messaging.inbox.read']
})

export function hasPermission(roles, permission) {
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission))
}
