import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type AdminUser,
  createAdminUser,
  deleteAdminUser,
  revokeAdminUserReader,
  setAdminUserReader,
  updateAdminUserRole,
} from "@/api";
import { formatDate } from "@/lib/date-format";
import { queryKeys } from "@/lib/query-keys";

// Renewal extends from max(now, current expiry) so topping up an active
// seat never discards the days already paid for.
export function readerExpiryBase(user: AdminUser): number {
  const current = user.reader_expires_at
    ? new Date(user.reader_expires_at).getTime()
    : Number.NaN;
  return Number.isNaN(current) ? Date.now() : Math.max(Date.now(), current);
}

export function getReaderStatus(user: AdminUser) {
  if (user.role !== "reader" || !user.reader_expires_at) return null;
  const expiry = new Date(user.reader_expires_at).getTime();
  if (Number.isNaN(expiry)) return null;
  const now = Date.now();
  const diffDays = Math.ceil((expiry - now) / 86_400_000);
  return {
    expired: diffDays <= 0,
    days: diffDays,
    dateFormatted: formatDate(user.reader_expires_at),
  };
}

/**
 * The member-management mutations and their cache invalidations. The role
 * matrix the server enforces is what these calls assume: only the team owner
 * changes roles, and only the owner resets another administrator's password
 * or removes one.
 */
export function useAdminUserMutations() {
  const queryClient = useQueryClient();

  const createUserMutation = useMutation({
    mutationFn: createAdminUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
    },
  });
  const deleteUserMutation = useMutation({
    mutationFn: deleteAdminUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
    },
  });
  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "admin" | "member" }) =>
      updateAdminUserRole(id, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.currentUser,
      });
    },
  });
  const setReaderMutation = useMutation({
    mutationFn: ({ id, expiresAt }: { id: string; expiresAt: string | null }) =>
      setAdminUserReader(id, expiresAt),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.currentUser,
      });
    },
  });
  const revokeReaderMutation = useMutation({
    mutationFn: (id: string) => revokeAdminUserReader(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.currentUser,
      });
    },
  });

  return {
    createUserMutation,
    deleteUserMutation,
    updateRoleMutation,
    setReaderMutation,
    revokeReaderMutation,
  };
}
