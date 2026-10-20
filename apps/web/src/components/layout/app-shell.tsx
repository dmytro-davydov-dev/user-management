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
  const { mode, toggleMode } = useThemeMode();
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
          <Typography variant="h6" component="span" sx={{ fontWeight: 700, flexGrow: 1 }}>
            User Management
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ display: { xs: 'none', sm: 'block' } }}
            data-testid="current-user"
          >
            {user.firstName} {user.lastName}
          </Typography>
          <Tooltip title={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            <IconButton onClick={toggleMode} aria-label="Toggle theme">
              {mode === 'dark' ? <LightModeOutlined /> : <DarkModeOutlined />}
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
