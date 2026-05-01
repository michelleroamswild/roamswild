import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  SpinnerGap,
  Copy,
  Check,
  PaperPlaneTilt,
  Clock,
  CheckCircle,
  UserCircle,
  Warning,
} from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Header } from '@/components/Header';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  approved_at: string | null;
  invite_code: string | null;
  used_at: string | null;
}

const ADMIN_EMAILS = ['michelle@roamswild.com', 'mictaylo@gmail.com'];

const Admin = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
      return;
    }
    if (!authLoading && user && !isAdmin) {
      navigate('/');
      return;
    }
    if (isAdmin) {
      fetchWaitlist();
    }
  }, [user, authLoading, isAdmin, navigate]);

  const fetchWaitlist = async () => {
    try {
      const { data, error } = await supabase
        .from('waitlist')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (err: any) {
      console.error('Error fetching waitlist:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (email: string) => {
    setApproving(email);
    try {
      const { data, error } = await supabase.rpc('approve_waitlist_entry', {
        waitlist_email: email,
      });
      if (error) throw error;

      await fetchWaitlist();

      if (data) {
        navigator.clipboard.writeText(data);
        setCopiedCode(data);
        setTimeout(() => setCopiedCode(null), 3000);

        try {
          await supabase.functions.invoke('send-invite-email', {
            body: { email, inviteCode: data },
          });
          toast.success(`Approved ${email} — invite emailed`);
        } catch (emailErr) {
          console.error('Failed to send invite email:', emailErr);
          toast.success(`Approved ${email} — code copied (email failed)`);
        }
      }
    } catch (err: any) {
      console.error('Error approving:', err);
      toast.error(err.message || 'Failed to approve');
    } finally {
      setApproving(null);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 3000);
  };

  const handleSendInviteEmail = async (email: string, code: string) => {
    setSendingEmail(email);
    try {
      const { error } = await supabase.functions.invoke('send-invite-email', {
        body: { email, inviteCode: code },
      });
      if (error) throw error;
      toast.success('Invite email sent');
    } catch (err: any) {
      console.error('Failed to send invite email:', err);
      toast.error('Failed to send: ' + (err.message || 'Unknown error'));
    } finally {
      setSendingEmail(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-cream dark:bg-paper flex items-center justify-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10">
          <SpinnerGap className="w-5 h-5 text-pine-6 animate-spin" />
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const pendingCount = entries.filter((e) => !e.invite_code).length;
  const approvedCount = entries.filter((e) => e.invite_code && !e.used_at).length;
  const usedCount = entries.filter((e) => e.used_at).length;

  return (
    <div className="bg-cream dark:bg-paper text-ink font-sans min-h-screen">
      <Header />

      {/* Hero strip */}
      <section className="relative overflow-hidden bg-cream dark:bg-paper-2 -mt-16 md:-mt-20">
        <div className="relative max-w-[1440px] mx-auto px-6 md:px-14 pt-28 md:pt-36 pb-10 md:pb-14">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Mono className="text-pine-6">
                Admin · {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              </Mono>
              <h1 className="font-sans font-bold tracking-[-0.035em] leading-[1] text-[44px] md:text-[64px] m-0 text-ink mt-2.5">
                Waitlist.
              </h1>
              <p className="text-[14px] text-ink-3 mt-3 max-w-md">
                Approve early access signups and send invite codes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* List section — paper-2 surface */}
      <section className="bg-paper-2 min-h-[calc(100vh-300px)]">
        <div className="max-w-[1440px] mx-auto px-6 md:px-14 py-10 md:py-14">
          {error && (
            <div className="mb-8 flex items-start gap-2 px-4 py-3 rounded-[14px] border border-ember/30 bg-ember/[0.06]">
              <Warning className="w-4 h-4 flex-shrink-0 mt-0.5 text-ember" weight="regular" />
              <p className="text-[13px] text-ember leading-[1.5]">{error}</p>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
            <StatCard accent="clay" Icon={Clock} label="Pending" value={pendingCount} />
            <StatCard accent="pine" Icon={CheckCircle} label="Approved" value={approvedCount} />
            <StatCard accent="water" Icon={UserCircle} label="Signed up" value={usedCount} />
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-paper-2 border border-line rounded-[18px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-cream dark:bg-paper-2 border-b border-line">
                  <tr>
                    <Th>Email</Th>
                    <Th>Joined</Th>
                    <Th>Status</Th>
                    <Th>Invite code</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, idx) => (
                    <tr
                      key={entry.id}
                      className={cn(
                        'hover:bg-cream/60 dark:hover:bg-paper-2/60 transition-colors',
                        idx !== entries.length - 1 && 'border-b border-line',
                      )}
                    >
                      <td className="px-4 py-3.5">
                        <p className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">
                          {entry.email}
                        </p>
                        {entry.name && (
                          <Mono className="text-ink-3 block mt-0.5">{entry.name}</Mono>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <Mono className="text-ink-3">
                          {new Date(entry.created_at).toLocaleDateString()}
                        </Mono>
                      </td>
                      <td className="px-4 py-3.5">
                        {entry.used_at ? (
                          <StatusPill icon={UserCircle} label="Signed up" tone="water" />
                        ) : entry.invite_code ? (
                          <StatusPill icon={CheckCircle} label="Approved" tone="pine" />
                        ) : (
                          <StatusPill icon={Clock} label="Pending" tone="clay" />
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {entry.invite_code ? (
                          <div className="inline-flex items-center gap-1.5">
                            <code className="text-[12px] font-mono font-semibold tracking-[0.06em] bg-cream dark:bg-paper-2 border border-line text-ink px-2 py-1 rounded-[8px]">
                              {entry.invite_code}
                            </code>
                            <button
                              onClick={() => handleCopyCode(entry.invite_code!)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-full text-ink-3 hover:text-ink hover:bg-cream dark:hover:bg-paper-2 transition-colors"
                              aria-label="Copy code"
                            >
                              {copiedCode === entry.invite_code ? (
                                <Check className="w-3.5 h-3.5 text-pine-6" weight="bold" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" weight="regular" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {!entry.invite_code ? (
                          <Pill
                            variant="solid-pine"
                            mono={false}
                            onClick={() => handleApprove(entry.email)}
                            className={cn(
                              'inline-flex',
                              approving === entry.email && 'opacity-50 pointer-events-none',
                            )}
                          >
                            {approving === entry.email ? (
                              <SpinnerGap className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="w-3.5 h-3.5" weight="regular" />
                                Approve
                              </>
                            )}
                          </Pill>
                        ) : !entry.used_at ? (
                          <Pill
                            variant="ghost"
                            mono={false}
                            onClick={() => handleSendInviteEmail(entry.email, entry.invite_code!)}
                            className={cn(
                              'inline-flex',
                              sendingEmail === entry.email && 'opacity-50 pointer-events-none',
                            )}
                          >
                            {sendingEmail === entry.email ? (
                              <SpinnerGap className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <PaperPlaneTilt className="w-3.5 h-3.5" weight="regular" />
                                Resend email
                              </>
                            )}
                          </Pill>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <div className="px-6 py-16 text-center">
                          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sage/15 text-sage mb-3">
                            <UserCircle className="w-5 h-5" weight="regular" />
                          </div>
                          <p className="text-[14px] font-sans font-semibold text-ink">
                            No waitlist entries yet
                          </p>
                          <p className="text-[13px] text-ink-3 mt-1">
                            Signups will show up here as people join the waitlist.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const Th = ({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) => (
  <th
    className={cn(
      'px-4 py-3 text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-ink-3',
      align === 'right' ? 'text-right' : 'text-left',
    )}
  >
    {children}
  </th>
);

const StatCard = ({
  accent,
  Icon,
  label,
  value,
}: {
  accent: 'clay' | 'pine' | 'water' | 'sage' | 'ember';
  Icon: typeof Clock;
  label: string;
  value: number;
}) => {
  const tones: Record<typeof accent, { bg: string; text: string }> = {
    clay: { bg: 'bg-clay/15', text: 'text-clay' },
    pine: { bg: 'bg-pine-6/12', text: 'text-pine-6' },
    water: { bg: 'bg-water/15', text: 'text-water' },
    sage: { bg: 'bg-sage/15', text: 'text-sage' },
    ember: { bg: 'bg-ember/15', text: 'text-ember' },
  };
  const t = tones[accent];
  return (
    <div className="bg-white dark:bg-paper-2 border border-line rounded-[14px] p-4 flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0', t.bg, t.text)}>
        <Icon className="w-5 h-5" weight="regular" />
      </div>
      <div>
        <p className="text-[28px] font-sans font-bold tracking-[-0.02em] text-ink leading-none">{value}</p>
        <Mono className="text-ink-3 mt-1 block">{label}</Mono>
      </div>
    </div>
  );
};

const StatusPill = ({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof Clock;
  label: string;
  tone: 'pine' | 'clay' | 'water';
}) => {
  const tones: Record<typeof tone, string> = {
    pine: 'bg-pine-6/12 text-pine-6',
    clay: 'bg-clay/15 text-clay',
    water: 'bg-water/15 text-water',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-[0.10em] font-semibold',
        tones[tone],
      )}
    >
      <Icon className="w-3 h-3" weight="regular" />
      {label}
    </span>
  );
};

export default Admin;
