'use client';

import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { User } from '@um/shared';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { apiClient } from '@/lib/client/api-client';
import { useThemeMode } from '@/theme/theme-mode';

export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toggleMode } = useThemeMode();
  const signOut = useMutation({
    mutationFn: apiClient.auth.signOut,
    // The BFF clears the cookie even if the API call fails, so always leave.
    onSettled: () => {
      queryClient.clear();
      router.replace('/sign-in');
    },
  });

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1 }}>
          {/* Phones drop the app name so the greeting always fits. */}
          <Typography
            variant="h6"
            component="span"
            sx={{ fontWeight: 700, display: { xs: 'none', sm: 'block' } }}
          >
            User Management
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            noWrap
            sx={{ flexGrow: 1, textAlign: { sm: 'right' } }}
            data-testid="greeting"
          >
            Hello, {user.firstName}
          </Typography>
          <Tooltip title="Toggle light/dark theme">
            <IconButton onClick={toggleMode} aria-label="Toggle theme">
              {/* Picked by CSS, not state: the server can't know the mode, so this never flips after hydration. */}
              <DarkModeOutlined sx={(theme) => theme.applyStyles('dark', { display: 'none' })} />
              <LightModeOutlined
                sx={(theme) => ({
                  display: 'none',
                  ...theme.applyStyles('dark', { display: 'inline-block' }),
                })}
              />
            </IconButton>
          </Tooltip>
          <Button
            color="inherit"
            startIcon={<LogoutOutlined />}
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
          >
            Sign out
          </Button>
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
        {children}
      </Container>
    </Box>
  );
}
