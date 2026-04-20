import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppSettings,
  AppStateResponse,
  AssetStub,
  FailedActionItem,
  QueueResponse,
  ReviewActionResponse
} from '../shared/contracts';
import { apiRequest } from './api';

type ConnectionMode = 'apiKey' | 'password';
type ActivityNotice = {
  tone: 'success' | 'info' | 'danger';
  text: string;
};
type SessionActionState = 'keep' | 'trash' | 'trash_failed';

const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function dateInTimezone(timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function formatReviewDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatReviewSpan(value: string, yearsBack: number) {
  const year = Number(value.slice(0, 4));
  return `${year - yearsBack}–${year - 1}`;
}

function formatCaptureDateShort(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function getAssetMeta(asset: AssetStub) {
  return {
    dimensions: asset.width && asset.height ? `${asset.width} × ${asset.height}` : 'Unknown',
    duration: asset.duration ?? 'Still image'
  };
}

function getModalImageSrc(asset: AssetStub) {
  return `/api/media/${asset.id}/thumbnail?size=preview`;
}

function optimisticallyRemoveAsset(queue: QueueResponse, assetId: string): QueueResponse {
  const exists = queue.items.some((candidate) => candidate.id === assetId);
  return {
    ...queue,
    items: queue.items.filter((candidate) => candidate.id !== assetId),
    completedCount: exists ? queue.completedCount + 1 : queue.completedCount,
    failedActions: queue.failedActions.filter((candidate) => candidate.assetId !== assetId)
  };
}

function restoreAsset(queue: QueueResponse, asset: AssetStub): QueueResponse {
  if (queue.items.some((candidate) => candidate.id === asset.id)) {
    return queue;
  }

  return {
    ...queue,
    items: [asset, ...queue.items],
    completedCount: Math.max(0, queue.completedCount - 1),
    failedActions: queue.failedActions.filter((candidate) => candidate.assetId !== asset.id)
  };
}

export function App() {
  const [appState, setAppState] = useState<AppStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refreshState() {
    const nextState = await apiRequest<AppStateResponse>('/api/state');
    setAppState(nextState);
  }

  useEffect(() => {
    refreshState()
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : 'Unable to load app state');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <ScreenShell eyebrow="Swipe to Clean" title="Warming up the deck." body="Loading configuration and session state." />;
  }

  if (error || !appState) {
    return (
      <ScreenShell
        eyebrow="Server Error"
        title="The companion could not boot cleanly."
        body={error ?? 'Unknown error'}
      />
    );
  }

  if (!appState.authenticated) {
    if (!appState.hasImmichConnection) {
      return (
        <ConnectionSetupScreen
          initialSettings={appState.settings}
          onComplete={refreshState}
          setupTokenRequired={appState.setupTokenRequired}
        />
      );
    }

    return <ImmichLoginScreen connectionMode={appState.connectionMode} onComplete={refreshState} />;
  }

  if (!appState.hasImmichConnection) {
    return (
      <ConnectionSetupScreen
        initialSettings={appState.settings}
        onComplete={refreshState}
        setupTokenRequired={appState.setupTokenRequired}
      />
    );
  }

  return <ReviewScreen state={appState} onStateRefresh={refreshState} />;
}

function ScreenShell(props: { eyebrow: string; title: string; body: string; children?: React.ReactNode }) {
  return (
    <main className="shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <section className="panel auth-panel">
        <p className="eyebrow">{props.eyebrow}</p>
        <h1>{props.title}</h1>
        <p className="lede">{props.body}</p>
        {props.children}
      </section>
    </main>
  );
}

function ImmichLoginScreen(props: { connectionMode: ConnectionMode | null; onComplete: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (props.connectionMode === 'apiKey') {
        await apiRequest('/api/auth/login/apikey', {
          method: 'POST',
          body: JSON.stringify({ apiKey })
        });
      } else {
        await apiRequest('/api/auth/login/password', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
      }
      await props.onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenShell
      eyebrow="Immich Login"
      title="Open today’s cleanup queue."
      body="This app does not need a separate companion password anymore. Use the same Immich auth mode you configured on first run."
    >
      <form className="stack" onSubmit={onSubmit}>
        {props.connectionMode === 'apiKey' ? (
          <label className="field">
            <span>Immich API key</span>
            <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" required />
          </label>
        ) : (
          <>
            <label className="field">
              <span>Immich email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
            </label>
            <label className="field">
              <span>Immich password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                required
                minLength={8}
              />
            </label>
          </>
        )}
        {error ? <p className="error-text">{error}</p> : null}
        <button className="primary-button" disabled={submitting}>
          {submitting ? 'Opening…' : 'Log in'}
        </button>
      </form>
    </ScreenShell>
  );
}

function ConnectionSetupScreen(props: {
  initialSettings: AppSettings;
  onComplete: () => Promise<void>;
  setupTokenRequired: boolean;
}) {
  const [mode, setMode] = useState<ConnectionMode>('apiKey');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [settings, setSettings] = useState<AppSettings>({
    yearsBack: props.initialSettings.yearsBack,
    timezone: props.initialSettings.timezone || BROWSER_TIMEZONE
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (props.setupTokenRequired && !setupToken.trim()) {
      setError('Enter the setup token from your server environment before first-run setup.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const headers = props.setupTokenRequired ? { 'x-setup-token': setupToken.trim() } : undefined;
      if (mode === 'apiKey') {
        await apiRequest('/api/auth/setup/apikey', {
          method: 'POST',
          headers,
          body: JSON.stringify({ baseUrl, apiKey, ...settings })
        });
      } else {
        await apiRequest('/api/auth/setup/login', {
          method: 'POST',
          headers,
          body: JSON.stringify({ baseUrl, email, password, ...settings })
        });
      }

      await props.onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Immich setup failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenShell
      eyebrow="First Run"
      title="Connect the companion to your library."
      body={
        props.setupTokenRequired
          ? 'Enter the one-time setup token from the server, then connect Immich once. That same auth method becomes your login for the cleanup app.'
          : 'Set the Immich connection once. That same auth method becomes your login for the cleanup app.'
      }
    >
      <form className="stack" onSubmit={onSubmit}>
        {props.setupTokenRequired ? (
          <label className="field">
            <span>Setup token</span>
            <input
              value={setupToken}
              onChange={(event) => setSetupToken(event.target.value)}
              type="password"
              autoComplete="one-time-code"
              required
            />
            <p className="helper-text">Set this with the `SETUP_TOKEN` environment variable before exposing a fresh server.</p>
          </label>
        ) : null}
        <p className="helper-text">
          Recommended: use an Immich API key. Password mode stores more encrypted secret material on this server so it can refresh
          Immich sessions.
        </p>
        <div className="segmented">
          <button type="button" className={mode === 'apiKey' ? 'active' : ''} onClick={() => setMode('apiKey')}>
            API key
          </button>
          <button type="button" className={mode === 'password' ? 'active' : ''} onClick={() => setMode('password')}>
            Email + password
          </button>
        </div>
        <label className="field">
          <span>Immich base URL</span>
          <input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            type="url"
            placeholder="https://photos.example.com"
            autoComplete="url"
            required
          />
          <p className="helper-text">Examples: `https://photos.example.com` behind a proxy, or `http://immich-server:2283` on the same Docker network.</p>
        </label>
        {mode === 'apiKey' ? (
          <label className="field">
            <span>Immich API key</span>
            <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="off" required />
          </label>
        ) : (
          <>
            <label className="field">
              <span>Immich email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required />
            </label>
            <label className="field">
              <span>Immich password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
              />
            </label>
          </>
        )}
        <div className="settings-grid">
          <label className="field">
            <span>Years back</span>
            <input
              value={settings.yearsBack}
              onChange={(event) =>
                setSettings((current) => ({ ...current, yearsBack: Number(event.target.value) || current.yearsBack }))
              }
              type="number"
              min={1}
              max={50}
              required
            />
          </label>
          <label className="field">
            <span>Review timezone</span>
            <input
              value={settings.timezone}
              onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))}
              type="text"
              required
            />
          </label>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <button className="primary-button" disabled={submitting}>
          {submitting ? 'Connecting…' : 'Save connection'}
        </button>
      </form>
    </ScreenShell>
  );
}

function ReviewScreen(props: { state: AppStateResponse; onStateRefresh: () => Promise<void> }) {
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionAssets, setSessionAssets] = useState<AssetStub[]>([]);
  const [sessionActions, setSessionActions] = useState<Record<string, SessionActionState>>({});
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const [pendingActions, setPendingActions] = useState(0);
  const [notice, setNotice] = useState<ActivityNotice | null>(null);

  const reviewDate = useMemo(() => dateInTimezone(props.state.settings.timezone), [props.state.settings.timezone]);
  const formattedReviewDate = useMemo(() => formatReviewDate(reviewDate), [reviewDate]);
  const reviewSpan = useMemo(
    () => formatReviewSpan(reviewDate, props.state.settings.yearsBack),
    [props.state.settings.yearsBack, reviewDate]
  );
  const queueLoadKey = `${reviewDate}:${props.state.settings.timezone}:${props.state.settings.yearsBack}`;

  async function loadQueue(resetSession = false) {
    setLoading(true);
    setError(null);

    try {
      const nextQueue = await apiRequest<QueueResponse>(`/api/review/queue?for=${reviewDate}`);
      setQueue(nextQueue);
      if (resetSession) {
        setSessionAssets(nextQueue.items);
        setSessionActions({});
        setModalIndex(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load today’s queue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue(true);
  }, [queueLoadKey]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const visibleAsset = queue?.items[0] ?? null;
  const nextAsset = queue?.items[1] ?? null;
  const modalAsset = modalIndex === null ? null : sessionAssets[modalIndex] ?? null;
  const progressRatio = queue && queue.totalCount > 0 ? Math.min(1, queue.completedCount / queue.totalCount) : 0;

  useEffect(() => {
    const preloadTargets = queue?.items.slice(0, 3) ?? [];
    preloadTargets.forEach((asset) => {
      const image = new Image();
      image.src = `/api/media/${asset.id}/thumbnail?size=preview`;
    });
  }, [queue]);

  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if (!visibleAsset || modalAsset) {
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        void handleAction('keep', visibleAsset);
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        void handleAction('trash', visibleAsset);
      }
    }

    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [visibleAsset, modalAsset]);

  async function handleAction(action: 'keep' | 'trash', asset: AssetStub) {
    if (!queue) {
      return;
    }

    setError(null);
    setPendingActions((current) => current + 1);
    setSessionActions((current) => ({
      ...current,
      [asset.id]: action
    }));
    setQueue((current) => (current ? optimisticallyRemoveAsset(current, asset.id) : current));
    setNotice({
      tone: action === 'keep' ? 'success' : 'info',
      text: action === 'keep' ? `Kept ${asset.originalFileName}` : `Queued ${asset.originalFileName} for trash`
    });

    try {
      const result = await apiRequest<ReviewActionResponse>(
        '/api/review/actions',
        {
          method: 'POST',
          body: JSON.stringify({
            assetId: asset.id,
            action,
            queueDate: queue.forDate
          })
        },
        props.state.csrfToken
      );

      if (result.state === 'trash_failed') {
        setSessionActions((current) => ({
          ...current,
          [asset.id]: 'trash_failed'
        }));
        setQueue((current) => {
          if (!current) {
            return current;
          }

          const failedActions: FailedActionItem[] = [
            {
              assetId: asset.id,
              state: 'trash_failed',
              errorMessage: result.errorMessage ?? 'Trash failed',
              updatedAt: new Date().toISOString(),
              asset
            },
            ...current.failedActions.filter((candidate) => candidate.assetId !== asset.id)
          ];

          return {
            ...current,
            failedActions
          };
        });
        setNotice({
          tone: 'danger',
          text: `Trash failed for ${asset.originalFileName}`
        });
      }
    } catch (cause) {
      setSessionActions((current) => {
        const next = { ...current };
        delete next[asset.id];
        return next;
      });
      setQueue((current) => (current ? restoreAsset(current, asset) : current));
      setError(cause instanceof Error ? cause.message : 'Action failed');
      setNotice({
        tone: 'danger',
        text: `Could not ${action} ${asset.originalFileName}`
      });
    } finally {
      setPendingActions((current) => Math.max(0, current - 1));
    }
  }

  async function handleRetry(assetId: string) {
    if (!queue) {
      return;
    }

    setPendingActions((current) => current + 1);
    try {
      const result = await apiRequest<ReviewActionResponse>(
        '/api/review/actions',
        {
          method: 'POST',
          body: JSON.stringify({
            assetId,
            action: 'retry-trash',
            queueDate: queue.forDate
          })
        },
        props.state.csrfToken
      );

      setQueue((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          failedActions:
            result.state === 'trashed'
              ? current.failedActions.filter((item) => item.assetId !== assetId)
              : current.failedActions.map((item) =>
                  item.assetId === assetId
                    ? { ...item, errorMessage: result.errorMessage ?? item.errorMessage, updatedAt: new Date().toISOString() }
                    : item
                )
        };
      });
      setNotice({
        tone: result.state === 'trashed' ? 'success' : 'danger',
        text: result.state === 'trashed' ? 'Retry trash succeeded' : 'Retry trash failed again'
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Retry failed');
      setNotice({
        tone: 'danger',
        text: 'Retry trash request could not be completed'
      });
    } finally {
      setPendingActions((current) => Math.max(0, current - 1));
    }
  }

  async function updateSettings(nextSettings: AppSettings) {
    await apiRequest(
      '/api/settings',
      {
        method: 'PUT',
        body: JSON.stringify(nextSettings)
      },
      props.state.csrfToken
    );
    await props.onStateRefresh();
    setSettingsOpen(false);
  }

  async function logout() {
    await apiRequest('/api/auth/logout', { method: 'POST' }, props.state.csrfToken);
    await props.onStateRefresh();
  }

  function openAssetModal(assetId: string) {
    const index = sessionAssets.findIndex((asset) => asset.id === assetId);
    if (index >= 0) {
      setModalIndex(index);
    }
  }

  function moveModal(direction: -1 | 1) {
    setModalIndex((current) => {
      if (current === null) {
        return current;
      }

      const next = current + direction;
      if (next < 0 || next >= sessionAssets.length) {
        return current;
      }

      return next;
    });
  }

  return (
    <main className="shell review-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      {settingsOpen ? (
        <SettingsPanel
          settings={props.state.settings}
          onSubmit={updateSettings}
          onCancel={() => setSettingsOpen(false)}
          onLogout={logout}
        />
      ) : null}

      {error ? <section className="panel banner error-banner">{error}</section> : null}
      {queue?.failedActions.length ? <RetryTray items={queue.failedActions} onRetry={handleRetry} /> : null}

      {loading ? (
        <section className="panel empty-state">
          <h2>Building today’s queue…</h2>
        </section>
      ) : queue && visibleAsset ? (
        <ReviewDeck
          asset={visibleAsset}
          nextAsset={nextAsset}
          progressRatio={progressRatio}
          queue={queue}
          formattedReviewDate={formattedReviewDate}
          reviewSpan={reviewSpan}
          pendingActions={pendingActions}
          onKeep={() => handleAction('keep', visibleAsset)}
          onTrash={() => handleAction('trash', visibleAsset)}
          onOpen={() => openAssetModal(visibleAsset.id)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <section className="panel empty-state">
          <h2>{queue?.totalCount ? 'Today is clear.' : 'No matches for this day.'}</h2>
          <p className="lede">
            {queue?.totalCount
              ? 'You finished the current queue. Tomorrow starts fresh, and leftovers do not roll forward.'
              : 'Try a different timezone or year range if you expected memories today.'}
          </p>
          <button className="ghost-button" onClick={() => void loadQueue(true)}>
            Refresh queue
          </button>
        </section>
      )}

      {modalAsset ? (
        <MediaModal
          asset={modalAsset}
          position={modalIndex ?? 0}
          total={sessionAssets.length}
          actionState={sessionActions[modalAsset.id] ?? null}
          canGoPrev={(modalIndex ?? 0) > 0}
          canGoNext={(modalIndex ?? 0) < sessionAssets.length - 1}
          onPrev={() => moveModal(-1)}
          onNext={() => moveModal(1)}
          onClose={() => setModalIndex(null)}
        />
      ) : null}
      {notice ? (
        <div className={`action-toast action-toast-${notice.tone}`} role="status" aria-live="polite">
          {notice.text}
        </div>
      ) : null}
    </main>
  );
}

function SettingsPanel(props: {
  settings: AppSettings;
  onSubmit: (settings: AppSettings) => Promise<void>;
  onCancel: () => void;
  onLogout: () => Promise<void>;
}) {
  const [yearsBack, setYearsBack] = useState(props.settings.yearsBack);
  const [timezone, setTimezone] = useState(props.settings.timezone);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await props.onSubmit({ yearsBack, timezone });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Settings could not be saved');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setError(null);

    try {
      await props.onLogout();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not log out');
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <form className="panel settings-panel" onSubmit={handleSubmit}>
      <div className="settings-grid">
        <label className="field">
          <span>Years back</span>
          <input value={yearsBack} onChange={(event) => setYearsBack(Number(event.target.value) || 1)} type="number" min={1} max={50} />
        </label>
        <label className="field">
          <span>Timezone</span>
          <input value={timezone} onChange={(event) => setTimezone(event.target.value)} type="text" />
        </label>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="row-actions">
        <button className="primary-button" disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        <button type="button" className="ghost-button" onClick={props.onCancel}>
          Cancel
        </button>
        <button type="button" className="ghost-button" onClick={() => void handleLogout()} disabled={loggingOut}>
          {loggingOut ? 'Logging out…' : 'Log out'}
        </button>
      </div>
    </form>
  );
}

function RetryTray(props: { items: FailedActionItem[]; onRetry: (assetId: string) => Promise<void> }) {
  return (
    <section className="panel retry-tray">
      <div className="retry-header">
        <div>
          <p className="eyebrow">Retry Tray</p>
          <h2>Trash failures stay out of the active deck.</h2>
        </div>
      </div>
      <div className="retry-list">
        {props.items.map((item) => (
          <article key={item.assetId} className="retry-item">
            <img src={`/api/media/${item.assetId}/thumbnail?size=thumbnail`} alt="" />
            <div>
              <strong>{item.asset.originalFileName}</strong>
              <p>{item.errorMessage ?? 'Immich rejected the delete request.'}</p>
            </div>
            <button className="ghost-button" onClick={() => void props.onRetry(item.assetId)}>
              Retry trash
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReviewDeck(props: {
  asset: AssetStub;
  nextAsset: AssetStub | null;
  progressRatio: number;
  queue: QueueResponse;
  formattedReviewDate: string;
  reviewSpan: string;
  pendingActions: number;
  onKeep: () => Promise<void>;
  onTrash: () => Promise<void>;
  onOpen: () => void;
  onOpenSettings: () => void;
}) {
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragIntent, setDragIntent] = useState<'keep' | 'trash' | null>(null);
  const [settlingIntent, setSettlingIntent] = useState<'keep' | 'trash' | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const settleTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setDragX(0);
    setDragIntent(null);
    setIsDragging(false);
    setSettlingIntent(null);
    pointerRef.current = null;
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
  }, [props.asset.id]);

  useEffect(() => {
    return () => {
      if (settleTimeoutRef.current !== null) {
        window.clearTimeout(settleTimeoutRef.current);
      }
    };
  }, []);

  function finishDrag(commitDirection: 'keep' | 'trash' | null) {
    if (settlingIntent) {
      return;
    }

    pointerRef.current = null;
    setIsDragging(false);

    if (!commitDirection) {
      setDragX(0);
      setDragIntent(null);
      return;
    }

    const dismissDistance = (stageRef.current?.clientWidth ?? window.innerWidth) * 1.15 * (commitDirection === 'keep' ? 1 : -1);
    setSettlingIntent(commitDirection);
    setDragIntent(commitDirection);
    setDragX(dismissDistance);
    settleTimeoutRef.current = window.setTimeout(() => {
      settleTimeoutRef.current = null;
      void (commitDirection === 'keep' ? props.onKeep() : props.onTrash());
    }, 150);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (settlingIntent) {
      return;
    }

    pointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointerRef.current || pointerRef.current.pointerId !== event.pointerId || settlingIntent) {
      return;
    }

    const deltaX = event.clientX - pointerRef.current.startX;
    const deltaY = event.clientY - pointerRef.current.startY;
    if (Math.abs(deltaY) > Math.abs(deltaX) * 1.4 && Math.abs(deltaY) > 12) {
      return;
    }

    event.preventDefault();
    setDragX(deltaX);
    setDragIntent(Math.abs(deltaX) > 12 ? (deltaX > 0 ? 'keep' : 'trash') : null);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointerRef.current || pointerRef.current.pointerId !== event.pointerId || settlingIntent) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const threshold = Math.min(140, (stageRef.current?.clientWidth ?? window.innerWidth) * 0.22);
    const delta = dragX;
    finishDrag(Math.abs(delta) >= threshold ? (delta > 0 ? 'keep' : 'trash') : null);
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointerRef.current || settlingIntent) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    finishDrag(null);
  }

  const rotation = dragX / 24;
  const actionStrength = Math.min(1, Math.abs(dragX) / 160);
  const activeActionLabel =
    dragIntent === 'keep' ? 'Keep' : dragIntent === 'trash' ? 'Trash' : 'Swipe to review';
  const activeActionHint =
    dragIntent === 'keep'
      ? 'Release to keep'
      : dragIntent === 'trash'
        ? 'Release to trash'
        : 'Right keeps · Left trashes';
  const nextScale = 0.96 + actionStrength * 0.035;
  const nextTranslateY = 20 - actionStrength * 12;
  const nextOpacity = 0.34 + actionStrength * 0.22;
  const activeTransition = isDragging ? 'none' : 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)';
  const nextTransition = 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease';

  return (
    <section className="workspace">
      <div className="panel stage-panel stage-panel-wide">
        <div className="stage-frame" ref={stageRef}>
          <div className="progress-track memory-progress stage-progress">
            <div className="progress-fill" style={{ width: `${props.progressRatio * 100}%` }} />
          </div>
          <div className="stage-topbar">
            <div className="stage-topbar-copy">
              <span>{props.formattedReviewDate}</span>
              <span>{props.reviewSpan}</span>
              <span>{props.queue.items.length} left</span>
            </div>
            <div className="stage-topbar-actions">
              {props.pendingActions ? <span className="inline-badge syncing-badge">Syncing {props.pendingActions}</span> : null}
              <button className="ghost-button stage-settings-button" onClick={props.onOpenSettings}>
                Settings
              </button>
            </div>
          </div>
          {props.nextAsset ? (
            <div
              className="card-stack next"
              style={{
                transform: `translateY(${nextTranslateY}px) scale(${nextScale})`,
                opacity: nextOpacity,
                transition: nextTransition
              }}
            >
              <AssetCard asset={props.nextAsset} faded />
            </div>
          ) : null}
          <div
            className={`card-stack active ${settlingIntent ? 'settling' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            style={{
              transform: `translate3d(${dragX}px, ${Math.min(14, Math.abs(dragX) * 0.04)}px, 0) rotate(${rotation}deg)`,
              transition: activeTransition
            }}
          >
            <AssetCard asset={props.asset} swipeDirection={dragIntent} swipeStrength={actionStrength} />
          </div>
          <div className={`gesture-banner ${dragIntent ?? 'idle'}`} style={{ opacity: dragIntent ? Math.max(0.22, actionStrength) : 0.12 }}>
            <span>{activeActionLabel}</span>
            <small>{activeActionHint}</small>
          </div>
        </div>

        <div className="memory-sheet">
          <div className="memory-copy">
            <p className="memory-date">{formatCaptureDateShort(props.asset.fileCreatedAt)}</p>
            <p className="memory-file">{props.asset.originalFileName}</p>
          </div>
          <div className="memory-actions">
            <button className="danger-button" onClick={() => finishDrag('trash')} disabled={Boolean(settlingIntent)}>
              Trash
            </button>
            <button className="ghost-button" onClick={props.onOpen} disabled={Boolean(settlingIntent)}>
              {props.asset.type === 'VIDEO' ? 'Play video' : 'Expand'}
            </button>
            <button className="primary-button" onClick={() => finishDrag('keep')} disabled={Boolean(settlingIntent)}>
              Keep
            </button>
          </div>
          <div className="keyboard-hints memory-hints">
            <span className="hint-chip">Left arrow trashes</span>
            <span className="hint-chip">Right arrow keeps</span>
            {props.asset.type === 'VIDEO' ? <span className="hint-chip">{getAssetMeta(props.asset).duration}</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function AssetCard(props: {
  asset: AssetStub;
  faded?: boolean;
  swipeDirection?: 'keep' | 'trash' | null;
  swipeStrength?: number;
}) {
  const previewSrc = `/api/media/${props.asset.id}/thumbnail?size=preview`;

  return (
    <article className={`asset-card ${props.faded ? 'faded' : ''}`}>
      <div className="asset-backdrop" style={{ backgroundImage: `url(${previewSrc})` }} />
      <img src={previewSrc} alt={props.asset.originalFileName} draggable={false} />
      <div className="asset-gradient" />
      {props.swipeDirection ? (
        <div className={`asset-wash ${props.swipeDirection}`} style={{ opacity: Math.min(0.34, (props.swipeStrength ?? 0) * 0.34) }} />
      ) : null}
      {props.asset.type === 'VIDEO' ? <span className="video-pill">Video</span> : null}
      {props.swipeDirection ? (
        <span className={`swipe-pill ${props.swipeDirection === 'keep' ? 'keep' : 'trash'}`}>
          {props.swipeDirection === 'keep' ? 'KEEP' : 'TRASH'}
        </span>
      ) : null}
      <footer className="asset-footer">
        <span>{new Date(props.asset.fileCreatedAt).getFullYear()}</span>
      </footer>
    </article>
  );
}

function MediaModal(props: {
  asset: AssetStub;
  position: number;
  total: number;
  actionState: SessionActionState | null;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const [dragY, setDragY] = useState(0);
  const [dragDirection, setDragDirection] = useState<'prev' | 'next' | null>(null);
  const pointerRef = useRef<{ pointerId: number; startY: number; startX: number } | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        props.onClose();
      }

      if ((event.key === 'ArrowUp' || event.key === 'ArrowLeft') && props.canGoPrev) {
        event.preventDefault();
        props.onPrev();
      }

      if ((event.key === 'ArrowDown' || event.key === 'ArrowRight') && props.canGoNext) {
        event.preventDefault();
        props.onNext();
      }
    }

    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [props]);

  function finishBrowse(direction: 'prev' | 'next' | null) {
    pointerRef.current = null;
    setDragY(0);
    setDragDirection(null);

    if (direction === 'prev' && props.canGoPrev) {
      props.onPrev();
    }

    if (direction === 'next' && props.canGoNext) {
      props.onNext();
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    pointerRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startX: event.clientX
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointerRef.current || pointerRef.current.pointerId !== event.pointerId) {
      return;
    }

    const deltaY = event.clientY - pointerRef.current.startY;
    const deltaX = event.clientX - pointerRef.current.startX;
    if (Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      return;
    }

    event.preventDefault();
    setDragY(deltaY);
    setDragDirection(Math.abs(deltaY) < 14 ? null : deltaY > 0 ? 'prev' : 'next');
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointerRef.current || pointerRef.current.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const threshold = 90;
    finishBrowse(Math.abs(dragY) >= threshold ? (dragY > 0 ? 'prev' : 'next') : null);
  }

  const browseHint =
    dragDirection === 'prev'
      ? 'Release for previous'
      : dragDirection === 'next'
        ? 'Release for next'
        : 'Swipe up or down to browse';

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header compact-modal-header">
          <div className="modal-meta-row">
            <span>{formatCaptureDateShort(props.asset.fileCreatedAt)}</span>
            <span>
              {props.position + 1} / {props.total}
            </span>
            {props.actionState ? <span className={`modal-state ${props.actionState}`}>{props.actionState.replace('_', ' ')}</span> : null}
            <span>{browseHint}</span>
          </div>
          <div className="row-actions modal-actions">
            <button className="ghost-button" onClick={props.onPrev} disabled={!props.canGoPrev}>
              Prev
            </button>
            <button className="ghost-button" onClick={props.onNext} disabled={!props.canGoNext}>
              Next
            </button>
            {props.asset.type === 'VIDEO' ? null : (
              <a className="ghost-button" href={`/api/media/${props.asset.id}/thumbnail?size=fullsize`} target="_blank" rel="noreferrer">
                Full image
              </a>
            )}
            <button className="ghost-button" onClick={props.onClose}>
              Close
            </button>
          </div>
        </div>
        <div
          className="modal-stage"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          style={{ transform: `translate3d(0, ${dragY}px, 0)` }}
        >
          {props.asset.type === 'VIDEO' ? (
            <video src={`/api/media/${props.asset.id}/original`} controls autoPlay playsInline />
          ) : (
            <img src={getModalImageSrc(props.asset)} alt={props.asset.originalFileName} />
          )}
        </div>
      </div>
    </div>
  );
}
