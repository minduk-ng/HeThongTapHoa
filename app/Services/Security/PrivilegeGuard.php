<?php

namespace App\Services\Security;

use App\Models\Page;
use App\Models\Role;
use App\Models\User;

final class PrivilegeGuard
{
    public static function assertRoot(User $actor): void
    {
        abort_unless((bool) $actor->is_root_admin, 403);
    }

    /** @param array<int, string> $roles */
    public static function assertCanAssignRoles(User $actor, User $target, array $roles): void
    {
        if (in_array('admin', $roles, true) || $target->isAdmin() || $target->is_root_admin) {
            self::assertRoot($actor);
            abort_if($target->id !== $actor->id && in_array('admin', $roles, true), 403);
        }
        abort_if($actor->id === $target->id && ! $actor->is_root_admin, 403);
        if ($roles !== []) {
            $grantRoles = Role::whereIn('name', $roles)->with(['permissions', 'pages'])->get();
            $permissionNames = $grantRoles->flatMap(fn (Role $r) => $r->permissions->pluck('name'))->map(fn ($n): string => (string) $n)->unique()->values()->all();
            $pageIds = $grantRoles->flatMap(fn (Role $r) => $r->pages->pluck('id'))->map(fn ($id): int => (int) $id)->unique()->values()->all();
            self::assertCanGrant($actor, $permissionNames, $pageIds);
        }
    }

    public static function assertCanModifyUser(User $actor, User $target): void
    {
        if ($target->isAdmin() || (bool) $target->is_root_admin) {
            self::assertRoot($actor);
        }
        abort_if($actor->id === $target->id && ! (bool) $actor->is_root_admin, 403);
    }

    /**
     * @param  array<int, string>  $permissionNames
     * @param  array<int, int>  $pageIds
     */
    public static function assertCanModifyRole(User $actor, Role $role, array $permissionNames, array $pageIds): void
    {
        if ($role->name === 'admin' || (bool) $role->is_system) {
            self::assertRoot($actor);
        }
        self::assertCanGrant($actor, $permissionNames, $pageIds);
    }

    /**
     * @param  array<int, string>  $permissionNames
     * @param  array<int, int>  $pageIds
     */
    public static function assertCanGrant(User $actor, array $permissionNames, array $pageIds): void
    {
        if ((bool) $actor->is_root_admin || $actor->isAdmin()) {
            return;
        }
        abort_if(array_diff($permissionNames, $actor->getAllPermissions()) !== [], 403);

        $ownedPageIds = Page::whereHas('roles', function ($query) use ($actor) {
            $query->whereIn('roles.id', $actor->roles()->pluck('roles.id'));
        })->pluck('pages.id')->map(fn ($id): int => (int) $id)->all();

        abort_if(array_diff(array_map('intval', $pageIds), $ownedPageIds) !== [], 403);
    }

    public static function assertRoleNameAllowed(string $name): void
    {
        abort_if(mb_strtolower(trim($name)) === 'admin', 403);
    }
}
