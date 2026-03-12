import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { useIpcListener } from '@/hooks/useIpcListener';
import appIcon from '../assets/icon.svg';

interface AuthViewProps {
  sessionExpired?: boolean;
  onAuthComplete: () => void;
  onContinueOffline: () => void;
}

export default function AuthView({ sessionExpired, onAuthComplete, onContinueOffline }: AuthViewProps) {
  const { t } = useTranslation('auth');
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useIpcListener(window.nakiros.onAuthComplete, () => {
    setIsLoading(false);
    setAuthError(null);
    onAuthComplete();
  });

  useIpcListener(window.nakiros.onAuthError, (payload) => {
    setIsLoading(false);
    setAuthError(payload.message || t('authError'));
  });

  async function handleSignIn() {
    setAuthError(null);
    setIsLoading(true);
    await window.nakiros.authSignIn();
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center p-6">
        <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.12fr_0.88fr]">
          <div className="hidden rounded-3xl border border-border bg-gradient-to-br from-card via-background to-card p-8 lg:flex lg:flex-col lg:justify-between">
            <div className="flex flex-col gap-4">
              <img src={appIcon} alt="Nakiros" className="size-14 rounded-2xl shadow-sm" />
              <div className="flex flex-col gap-3">
                <p className="m-0 font-mono text-5xl font-semibold leading-none tracking-[-0.04em] text-foreground">
                  Nakiros
                </p>
                <div className="flex max-w-xl flex-col gap-1 font-mono text-2xl leading-snug">
                  <p className="m-0 text-foreground">{t('headline')}</p>
                  <p className="m-0 text-primary">{t('subtitleAccent')}</p>
                  <p className="m-0 text-foreground">{t('subtitle')}</p>
                </div>
                <p className="m-0 max-w-xl text-base leading-7 text-muted-foreground">
                  {t('heroDescription')}
                </p>
              </div>
            </div>
          </div>

          <Card className="border-border/80 bg-card/95 shadow-none backdrop-blur">
            <CardHeader className="items-center gap-4 text-center">
              <img src={appIcon} alt="Nakiros" className="size-14 rounded-2xl lg:hidden" />
              <div className="space-y-1">
                <CardTitle>{t('signIn')}</CardTitle>
                <CardDescription>{t('cardDescriptionSignIn')}</CardDescription>
              </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              {sessionExpired ? (
                <Alert>
                  <TriangleAlert />
                  <div>
                    <AlertTitle>{t('sessionTitle')}</AlertTitle>
                    <AlertDescription>{t('sessionExpired')}</AlertDescription>
                  </div>
                </Alert>
              ) : null}

              {authError ? (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <div>
                    <AlertTitle>{t('authErrorTitle')}</AlertTitle>
                    <AlertDescription>{authError}</AlertDescription>
                  </div>
                </Alert>
              ) : null}

              <Button
                className="w-full"
                disabled={isLoading}
                onClick={() => void handleSignIn()}
                size="lg"
              >
                {isLoading ? t('actions.openingBrowser') : t('signIn')}
              </Button>

              <Button
                className="w-full"
                disabled={isLoading}
                onClick={onContinueOffline}
                size="lg"
                variant="secondary"
              >
                {t('continueOffline')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
