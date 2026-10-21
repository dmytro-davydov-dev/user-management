'use client';

import DeleteOutline from '@mui/icons-material/DeleteOutline';
import EditOutlined from '@mui/icons-material/EditOutlined';
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

export function UsersTable({ users, currentUserId, onEdit, onDelete }: Props) {
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
        <Chip
          label={STATUS_LABELS[user.status]}
          color={user.status === 'ACTIVE' ? 'success' : 'default'}
          size="small"
          variant={user.status === 'ACTIVE' ? 'filled' : 'outlined'}
        />
      </TableCell>
      <TableCell align="right">{user.loginsCount}</TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        <time dateTime={user.createdAt}>{formatDateTime(user.createdAt)}</time>
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        <time dateTime={user.updatedAt}>{formatDateTime(user.updatedAt)}</time>
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
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
      </TableCell>
    </TableRow>
  );
}

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
