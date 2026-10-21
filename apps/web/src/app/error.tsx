'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <Box
      component="main"
      role="alert"
      sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', textAlign: 'center', p: 3 }}
    >
      {/* Error boundaries are client components and can't export `metadata`; React 19 hoists this. */}
      <title>Something went wrong · User Management</title>
      <Box>
        <Typography variant="h1" gutterBottom>
          Something went wrong
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          The service may be temporarily unavailable. Please try again.
        </Typography>
        <Button variant="contained" onClick={reset}>
          Try again
        </Button>
      </Box>
    </Box>
  );
}
