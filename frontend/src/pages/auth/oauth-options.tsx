import { useParams, useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { acceptOrganizationInvite, githubSignInUrl, googleSignInUrl, microsoftSignInUrl } from '~/api/api';
import { Button } from '~/components/ui/button';
import { SignInRoute } from '~/router/routeTree';
import { useThemeStore } from '~/store/theme';

const oauthOptions = [
  {
    name: 'Github',
    url: githubSignInUrl,
    acceptInvite: (token: string) =>
      acceptOrganizationInvite({
        token,
        oauth: 'github',
      }),
  },
  {
    name: 'Google',
    url: googleSignInUrl,
    acceptInvite: (token: string) =>
      acceptOrganizationInvite({
        token,
        oauth: 'google',
      }),
  },
  {
    name: 'Microsoft',
    url: microsoftSignInUrl,
    acceptInvite: (token: string) =>
      acceptOrganizationInvite({
        token,
        oauth: 'microsoft',
      }),
  },
];

interface OauthOptionsProps {
  actionType: 'check' | 'signIn' | 'signUp' | 'acceptInvite';
}

const OauthOptions = ({ actionType = 'signIn' }: OauthOptionsProps) => {
  const { mode } = useThemeStore();
  const { token } = useParams({ strict: false });
  const invertClass = mode === 'dark' ? 'invert' : '';
  let redirect = '';
  if (actionType !== 'acceptInvite') {
    const searchResult = useSearch({
      from: SignInRoute.id,
    });
    redirect = searchResult.redirect ?? '';
  }

  const redirectQuery = redirect ? `?redirect=${redirect}` : '';

  return (
    <>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="text-muted-foreground px-2">Or</span>
      </div>

      <div className="flex flex-col space-y-2">
        {oauthOptions.map((option) => {
          if (!config.oauthOptions.includes(option.name)) return null;

          return (
            <Button
              key={option.name}
              type="button"
              variant="outline"
              onClick={
                actionType === 'acceptInvite' && token
                  ? () =>
                      option.acceptInvite(token).then((url) => {
                        window.location.href = url;
                      })
                  : () => {
                      window.location.href = option.url + redirectQuery;
                    }
              }
            >
              <img
                src={`/images/${option.name.toLowerCase()}-icon.svg`}
                alt={option.name}
                className={`w-4 h-4 mr-2 ${option.name === 'Github' ? invertClass : ''}`}
                loading="lazy"
              />
              {actionType === 'acceptInvite' ? 'Accept' : actionType === 'signUp' ? 'Sign up' : 'Sign in'} with {option.name}
            </Button>
          );
        })}
      </div>
    </>
  );
};

export default OauthOptions;
