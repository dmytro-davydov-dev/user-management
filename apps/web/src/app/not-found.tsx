import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import NextLink from 'next/link';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <Box
      component="main"
      sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', textAlign: 'center', p: 3 }}
    >
      <Box>
        <Typography variant="h1" gutterBottom>
          Page not found
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          The page you’re looking for doesn’t exist or has moved.
        </Typography>
        {/* `/` sends you to the dashboard or to sign-up, depending on your session. */}
        <Button variant="contained" component={NextLink} href="/">
          Go to the app
        </Button>
      </Box>
    </Box>
  );
}
