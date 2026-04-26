import { afterEach, describe, expect, it } from 'vitest';
import { GET as logoutRoute } from '../src/routes/logout/+server';
import { actions as loginActions } from '../src/routes/login/+page.server';
import { POST as loginApiRoute } from '../src/routes/api/auth/login/+server';
import { POST as logoutApiRoute } from '../src/routes/api/auth/logout/+server';
import { SESSION_COOKIE_NAME } from '../src/lib/server/auth';

function createCookiesMock() {
  const calls: {
    set: Array<{ name: string; value: string; options: Record<string, unknown> }>;
    delete: Array<{ name: string; options: Record<string, unknown> }>;
  } = {
    set: [],
    delete: []
  };

  return {
    calls,
    cookies: {
      set(name: string, value: string, options: Record<string, unknown>) {
        calls.set.push({ name, value, options });
      },
      delete(name: string, options: Record<string, unknown>) {
        calls.delete.push({ name, options });
      }
    }
  };
}

const previousPassword = process.env.ADMIN_PASSWORD;

afterEach(() => {
  process.env.ADMIN_PASSWORD = previousPassword;
});

describe('auth cookie flow', () => {
  it('login action redirects and sets the session cookie', async () => {
    process.env.ADMIN_PASSWORD = 'secret';
    const { cookies, calls } = createCookiesMock();
    const request = new Request('http://localhost/login?next=/notes', {
      method: 'POST',
      body: new URLSearchParams({ password: 'secret' })
    });

    await expect(
      loginActions.default({
        request,
        cookies: cookies as never,
        url: new URL('http://localhost/login?next=/notes')
      } as never)
    ).rejects.toMatchObject({ status: 303, location: '/notes' });

    expect(calls.set).toHaveLength(1);
    expect(calls.set[0]?.name).toBe(SESSION_COOKIE_NAME);
    expect(calls.set[0]?.value).toBe('secret');
  });

  it('login action rejects an incorrect password', async () => {
    process.env.ADMIN_PASSWORD = 'secret';
    const { cookies, calls } = createCookiesMock();
    const request = new Request('http://localhost/login', {
      method: 'POST',
      body: new URLSearchParams({ password: 'wrong' })
    });

    const result = await loginActions.default({
      request,
      cookies: cookies as never,
      url: new URL('http://localhost/login')
    } as never);

    expect(result?.status).toBe(400);
    expect(calls.set).toHaveLength(0);
  });

  it('login API sets the same HttpOnly session cookie', async () => {
    process.env.ADMIN_PASSWORD = 'secret';
    const { cookies, calls } = createCookiesMock();
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'secret' }),
      headers: { 'Content-Type': 'application/json' }
    });

    const response = await loginApiRoute({ request, cookies: cookies as never } as never);
    expect(response.status).toBe(200);
    expect(calls.set).toHaveLength(1);
    expect(calls.set[0]?.name).toBe(SESSION_COOKIE_NAME);
  });

  it('logout endpoints clear the session cookie', async () => {
    const apiCookies = createCookiesMock();
    const apiResponse = await logoutApiRoute({ cookies: apiCookies.cookies as never } as never);
    expect(apiResponse.status).toBe(200);
    expect(apiCookies.calls.delete[0]?.name).toBe(SESSION_COOKIE_NAME);

    const routeCookies = createCookiesMock();
    await expect(logoutRoute({ cookies: routeCookies.cookies as never } as never)).rejects.toMatchObject({
      status: 303,
      location: '/login'
    });
    expect(routeCookies.calls.delete[0]?.name).toBe(SESSION_COOKIE_NAME);
  });
});
