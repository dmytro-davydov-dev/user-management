'use client';

import DeleteOutline from '@mui/icons-material/DeleteOutline';
import EditOutlined from '@mui/icons-material/EditOutlined';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { USERS_PAGE_SIZE, type User } from '@um/shared';
import type { Theme } from '@mui/material/styles';
import { formatDateTime, fullName } from './format';
import { STATUS_LABELS } from './status';

const COLUMNS = ['Name', 'Email', 'Status', 'Logins', 'Created', 'Updated'] as const;

interface Props {
  /** `undefined` renders the loading skeleton. */
  users: User[] | undefined;
  currentUserId: string;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
}

/**
 * Users as a table, or as a list of cards under 600 px. Both are rendered and CSS picks one,
 * so the server-rendered markup already matches the viewport (no swap after hydration).
 * Desktop-first on purpose: without media queries (e.g. jsdom) only the table is shown.
 */
export function UsersTable(props: Props) {
  return (
    <>
      <Box sx={(theme: Theme) => ({ [theme.breakpoints.down('sm')]: { display: 'none' } })}>
        <UsersTableView {...props} />
      </Box>
      <Box
        sx={(theme: Theme) => ({
          display: 'none',
          [theme.breakpoints.down('sm')]: { display: 'block' },
        })}
      >
        <UserCardList {...props} />
      </Box>
    </>
  );
}

function UsersTableView({ users, currentUserId, onEdit, onDelete }: Props) {
  const loading = users === undefined;
  return (
    // `relative` keeps the absolutely positioned header label inside the scroll area.
    <TableContainer component={Paper} variant="outlined" sx={{ position: 'relative' }}>
      <Table aria-label="Users" aria-busy={loading} size="medium">
        <TableHead>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableCell key={c} align={c === 'Logins' ? 'right' : 'left'}>
                {c}
              </TableCell>
            ))}
            <TableCell align="right">
              <Typography component="span" variant="inherit" sx={visuallyHidden}>
                Actions
              </Typography>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading
            ? Array.from({ length: USERS_PAGE_SIZE }, (_, i) => (
                <TableRow key={i} data-testid="users-skeleton-row">
                  {[...COLUMNS, 'actions'].map((c) => (
                    <TableCell key={c}>
                      <Skeleton variant="text" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSelf={user.id === currentUserId}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function UserRow({
  user,
  isSelf,
  onEdit,
  onDelete,
}: {
  user: User;
  isSelf: boolean;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
}) {
  const name = fullName(user);
  return (
    <TableRow hover>
      <TableCell component="th" scope="row" sx={{ whiteSpace: 'nowrap' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <span>{name}</span>
          {isSelf && <Chip label="You" size="small" variant="outlined" />}
        </Stack>
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>{user.email}</TableCell>
      <TableCell>
        <StatusChip status={user.status} />
      </TableCell>
      <TableCell align="right">{user.loginsCount}</TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        <time dateTime={user.createdAt}>{formatDateTime(user.createdAt)}</time>
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        <time dateTime={user.updatedAt}>{formatDateTime(user.updatedAt)}</time>
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        <RowActions user={user} onEdit={onEdit} onDelete={onDelete} />
      </TableCell>
    </TableRow>
  );
}

/** Card layout for narrow screens: one `<li>` per user, same actions and labels as the table. */
export function UserCardList({ users, currentUserId, onEdit, onDelete }: Props) {
  const loading = users === undefined;
  return (
    <Stack component="ul" spacing={1.5} aria-label="Users" aria-busy={loading} sx={listReset}>
      {loading
        ? Array.from({ length: USERS_PAGE_SIZE }, (_, i) => (
            <Paper key={i} component="li" variant="outlined" sx={{ p: 2 }}>
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="text" width="80%" />
              <Skeleton variant="text" width="40%" />
            </Paper>
          ))
        : users.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              isSelf={user.id === currentUserId}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
    </Stack>
  );
}

function UserCard({
  user,
  isSelf,
  onEdit,
  onDelete,
}: {
  user: User;
  isSelf: boolean;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
}) {
  const name = fullName(user);
  return (
    <Paper component="li" variant="outlined" sx={{ p: 2 }} aria-label={name}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ alignItems: 'center', flexWrap: 'wrap' }}
          >
            <Typography component="span" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
              {name}
            </Typography>
            {isSelf && <Chip label="You" size="small" variant="outlined" />}
            <StatusChip status={user.status} />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {user.email}
          </Typography>
        </Box>
        <Box sx={{ flexShrink: 0, mt: -0.5, mr: -1 }}>
          <RowActions user={user} onEdit={onEdit} onDelete={onDelete} />
        </Box>
      </Stack>
      <Box
        component="dl"
        sx={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          columnGap: 2,
          rowGap: 0.25,
          m: 0,
          mt: 1.5,
          typography: 'body2',
          '& dt': { color: 'text.secondary' },
          '& dd': { m: 0 },
        }}
      >
        <dt>Logins</dt>
        <dd>{user.loginsCount}</dd>
        <dt>Created</dt>
        <dd>
          <time dateTime={user.createdAt}>{formatDateTime(user.createdAt)}</time>
        </dd>
        <dt>Updated</dt>
        <dd>
          <time dateTime={user.updatedAt}>{formatDateTime(user.updatedAt)}</time>
        </dd>
      </Box>
    </Paper>
  );
}

function StatusChip({ status }: { status: User['status'] }) {
  return (
    <Chip
      label={STATUS_LABELS[status]}
      color={status === 'ACTIVE' ? 'success' : 'default'}
      size="small"
      variant={status === 'ACTIVE' ? 'filled' : 'outlined'}
    />
  );
}

function RowActions({
  user,
  onEdit,
  onDelete,
}: {
  user: User;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
}) {
  const name = fullName(user);
  return (
    <>
      <Tooltip title="Edit">
        <IconButton aria-label={`Edit ${name}`} onClick={() => onEdit(user)} size="small">
          <EditOutlined fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete">
        <IconButton aria-label={`Delete ${name}`} onClick={() => onDelete(user)} size="small">
          <DeleteOutline fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );
}

const listReset = { listStyle: 'none', m: 0, p: 0 } as const;

// Pixel strings on purpose: in `sx`, a bare `1` means 100%.
const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  border: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;
