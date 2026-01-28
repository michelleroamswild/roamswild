import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Jeep, SpinnerGap, Copy, Check, PaperPlaneTilt, Clock, CheckCircle, UserCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  approved_at: string | null;
  invite_code: string | null;
  used_at: string | null;
}

// Add your admin email here
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

      // Refresh the list
      await fetchWaitlist();

      // Auto-copy the code and send email
      if (data) {
        navigator.clipboard.writeText(data);
        setCopiedCode(data);
        setTimeout(() => setCopiedCode(null), 3000);

        // Send invite email
        try {
          await supabase.functions.invoke('send-invite-email', {
            body: { email, inviteCode: data },
          });
        } catch (emailErr) {
          console.error('Failed to send invite email:', emailErr);
          // Don't fail the whole operation if email fails
        }
      }
    } catch (err: any) {
      console.error('Error approving:', err);
      alert(err.message || 'Failed to approve');
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
      alert('Invite email sent!');
    } catch (err: any) {
      console.error('Failed to send invite email:', err);
      alert('Failed to send email: ' + (err.message || 'Unknown error'));
    } finally {
      setSendingEmail(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <SpinnerGap className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const pendingCount = entries.filter(e => !e.invite_code).length;
  const approvedCount = entries.filter(e => e.invite_code && !e.used_at).length;
  const usedCount = entries.filter(e => e.used_at).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Jeep className="w-6 h-6 text-primary" weight="fill" />
            <span className="text-xl font-display font-bold text-foreground">RoamsWild Admin</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            Back to App
          </Button>
        </div>
      </header>

      <main className="container px-4 md:px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-display font-bold text-foreground mb-2">Waitlist</h1>
          <p className="text-muted-foreground mb-8">
            Manage early access signups
          </p>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 mb-6 text-destructive">
              {error}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{pendingCount}</p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{approvedCount}</p>
                  <p className="text-sm text-muted-foreground">Approved</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <UserCircle className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{usedCount}</p>
                  <p className="text-sm text-muted-foreground">Signed Up</p>
                </div>
              </div>
            </div>
          </div>

          {/* Waitlist Table */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground">Email</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground">Joined</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground">Invite Code</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{entry.email}</p>
                        {entry.name && (
                          <p className="text-xs text-muted-foreground">{entry.name}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {entry.used_at ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600">
                          <UserCircle className="w-3 h-3" />
                          Signed Up
                        </span>
                      ) : entry.invite_code ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent">
                          <CheckCircle className="w-3 h-3" />
                          Approved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600">
                          <Clock className="w-3 h-3" />
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {entry.invite_code ? (
                        <div className="flex items-center gap-2">
                          <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
                            {entry.invite_code}
                          </code>
                          <button
                            onClick={() => handleCopyCode(entry.invite_code!)}
                            className="p-1 hover:bg-muted rounded transition-colors"
                            title="Copy code"
                          >
                            {copiedCode === entry.invite_code ? (
                              <Check className="w-4 h-4 text-accent" />
                            ) : (
                              <Copy className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!entry.invite_code ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleApprove(entry.email)}
                          disabled={approving === entry.email}
                        >
                          {approving === entry.email ? (
                            <SpinnerGap className="w-4 h-4 animate-spin" />
                          ) : (
                            'Approve'
                          )}
                        </Button>
                      ) : !entry.used_at ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleSendInviteEmail(entry.email, entry.invite_code!)}
                          disabled={sendingEmail === entry.email}
                        >
                          {sendingEmail === entry.email ? (
                            <SpinnerGap className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <PaperPlaneTilt className="w-4 h-4 mr-1" />
                              Send Email
                            </>
                          )}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No waitlist entries yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Admin;
