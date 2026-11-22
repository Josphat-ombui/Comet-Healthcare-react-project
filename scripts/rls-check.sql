\echo default tenant:
show app.company_id;

select count(*) as users_default_tenant from "User";
select count(*) as threads_default_tenant from "Thread";
select count(*) as inboxes_default_tenant from "Inbox";

set app.company_id = 'cmp_other';

\echo other tenant:
select count(*) as users_other_tenant from "User";
select count(*) as threads_other_tenant from "Thread";
