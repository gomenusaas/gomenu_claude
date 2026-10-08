-- Staff onboarding two-gate model (spec §4): token is random, single-use, expiring,
-- restaurant- and phone-bound; forwarding the link grants nothing; cancel/resend invalidate.
begin;
select plan(30);
select tests.build_fixtures();

-- Invite as A's owner; read the raw token from the queued WhatsApp message.
select tests.authenticate_as('owner_a');
select lives_ok(format($s$select public.invite_staff(%L, 'Sara Waiter', '+96891110001', %L)$s$,
                       tests.id('restaurant_a'), tests.id('a2')), 'owner invites a staff member');
select throws_ok(format($s$select public.invite_staff(%L, 'Dup', '+96891110001')$s$, tests.id('restaurant_a')),
                 '23505', null, 'the same number cannot be invited twice');
select throws_ok(format($s$select public.invite_staff(%L, 'Bad', '91110001')$s$, tests.id('restaurant_a')),
                 '22023', null, 'numbers must be E.164');
reset role;

create temp table inv as
select m.id as membership_id,
       (select payload ->> 'token' from private.message_outbox o
         where o.to_phone_e164 = '+96891110001' and template = 'staff_invitation'
         order by created_at desc limit 1) as token
  from public.memberships m where m.invited_phone_e164 = '+96891110001';
grant select on inv to anon, authenticated, service_role;

select is((select status::text from public.memberships where id = (select membership_id from inv)), 'invitation_sent', 'status: Invitation Sent');
select is((select role_id from public.memberships where id = (select membership_id from inv)),
          (select id from public.roles where is_new_staff), 'invitee holds the New Staff role');
select ok(length((select token from inv)) >= 43, 'token carries 256 bits of randomness');
select is((select count(*) from public.staff_invitations where token_hash = private.hash_token((select token from inv))), 1::bigint,
          'only the hash of the token is stored');
select is((select count(*) from public.staff_invitations i where encode(i.token_hash, 'escape') like '%' || (select token from inv) || '%'), 0::bigint,
          'the raw token is not stored in the invitations table');

-- Public preview by token (anon): masked number only.
select tests.authenticate_as_anon();
select is((public.get_invitation_preview((select token from inv))) ->> 'status', 'valid', 'preview: valid token');
select is((public.get_invitation_preview((select token from inv))) ->> 'phone_masked', '+968•••••001', 'preview masks the number');
select is((public.get_invitation_preview('x' || (select token from inv))) ->> 'status', 'invalid', 'preview: unknown token reveals nothing');
select throws_ok(format('select public.open_invitation(%L)', (select token from inv)), '42501', null,
                 'clients cannot resolve the token to the phone number');
reset role;

-- Server opens the invitation (service role) to send the OTP to the INVITED number.
select tests.authenticate_as_service_role();
select is(public.open_invitation((select token from inv)), '+96891110001', 'server resolves token to the invited number');
reset role;
select is((select status::text from public.memberships where id = (select membership_id from inv)), 'verification_pending',
          'status: Verification Pending');

-- A forwarded link: someone with a different verified number cannot accept it.
select tests.authenticate_as('outsider');
select throws_ok(format('select public.accept_staff_invitation(%L)', (select token from inv)), '42501', null,
                 'forwarded link: a different phone cannot accept');
reset role;

-- The real invitee verified their phone via OTP (simulated by a confirmed auth user).
select tests.create_user('sara', '+96891110001');
select tests.authenticate_as('sara');
select is(public.accept_staff_invitation((select token from inv)), (select membership_id from inv), 'invitee accepts with the invited phone');
select throws_ok(format('select public.accept_staff_invitation(%L)', (select token from inv)), '22023', null,
                 'token is single-use');
select throws_ok(format($s$select public.complete_staff_verification(%L, '111111')$s$, (select membership_id from inv)),
                 '22023', null, 'weak PINs are rejected');
select throws_ok(format($s$select public.complete_staff_verification(%L, '12ab56')$s$, (select membership_id from inv)),
                 '22023', null, 'PIN must be 6 digits');
select ok(public.complete_staff_verification((select membership_id from inv), '583920'), 'PIN set; verification complete');
select is((public.get_my_context()) ->> 'next', 'pending', 'verified invitee lands on the pending screen');
select is(tests.count_rows('public.memberships'), 0::bigint, 'verified New Staff still reads zero memberships');
reset role;

select is((select status::text from public.memberships where id = (select membership_id from inv)), 'new_staff',
          'status: Verified / New Staff (awaiting role)');
select ok((select pin_hash from private.staff_credentials where user_id = tests.id('sara')) like '$2%',
          'PIN stored as a bcrypt hash');
select ok((select pin_hash not like '%583920%' from private.staff_credentials where user_id = tests.id('sara')),
          'PIN is never stored in plaintext');
select ok(exists (select 1 from public.restaurant_notifications where kind = 'staff.verified'
                   and object_id = (select membership_id from inv) and required_permission = 'staff.manage'),
          'admins are notified: New Staff Verified');

-- Cancel and resend invalidate old tokens.
select tests.authenticate_as('owner_a');
select public.invite_staff(tests.id('restaurant_a'), 'Omar', '+96891110002');
reset role;
create temp table inv2 as
select m.id as membership_id,
       (select payload ->> 'token' from private.message_outbox o where o.to_phone_e164 = '+96891110002'
         order by created_at desc limit 1) as old_token
  from public.memberships m where m.invited_phone_e164 = '+96891110002';
grant select on inv2 to authenticated, anon;
select tests.authenticate_as('owner_a');
select public.resend_staff_invitation((select membership_id from inv2));
select tests.authenticate_as_anon();
select is((public.get_invitation_preview((select old_token from inv2))) ->> 'status', 'replaced', 'resend invalidates the previous token');
select tests.authenticate_as('owner_a');
select public.cancel_staff_invitation((select membership_id from inv2));
reset role;
select is((select count(*) from public.staff_invitations where membership_id = (select membership_id from inv2) and status in ('pending', 'opened')),
          0::bigint, 'cancel invalidates every token for that invitation');

-- Expiry
update public.staff_invitations set expires_at = now() - interval '1 minute'
 where membership_id = tests.id('membership:restaurant_a:new_staff_a') or full_name = 'Invited A';
create temp table inv3 as
select payload ->> 'token' as token from private.message_outbox where to_phone_e164 = '+96890000006' limit 1;
grant select on inv3 to anon;
select tests.authenticate_as_anon();
select is((public.get_invitation_preview((select token from inv3))) ->> 'status',
          'expired', 'expired tokens are refused');
reset role;
select is((select status::text from public.memberships where invited_phone_e164 = '+96890000006'), 'expired',
          'status: Expired');

select * from finish();
rollback;
