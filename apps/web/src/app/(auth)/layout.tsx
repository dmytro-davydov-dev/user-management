import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Box
      component="main"
      sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', px: 2, py: 6 }}
    >
      <Paper
        variant="outlined"
        sx={{ width: '100%', maxWidth: 440, p: { xs: 3, sm: 4 }, borderRadius: 3 }}
      >
        {children}
      </Paper>
    </Box>
  );
}
