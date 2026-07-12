import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { FormField } from "@/components/ui/form-field"
import { Breadcrumb } from "@/components/ui/breadcrumb"
import { Dialog } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { PasswordStrength } from "@/components/ui/password-strength"
import { useToast } from "@/components/ui/toast"
import { useAuth } from "@/lib/auth"
import { usePasswordActions, useAccountActions } from "@/lib/hooks"
import { cn, isValidEmail } from "@/lib/utils"
import { motion } from "framer-motion"

export default function SettingsPage() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const { user, updateUser, logout } = useAuth()
  const { updatePassword } = usePasswordActions()
  const { deleteAccount } = useAccountActions()

  // Profile
  const [name, setName] = useState(user?.name ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({})
  const [profileSaving, setProfileSaving] = useState(false)

  // Sync profile state when user data loads/changes
  useEffect(() => {
    if (user) {
      setName(user.name ?? "")
      setEmail(user.email ?? "")
    }
  }, [user])

  // Password
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({})
  const [passwordSaving, setPasswordSaving] = useState(false)

  // Notifications
  const [notifDns, setNotifDns] = useState(true)
  const [notifSuspension, setNotifSuspension] = useState(false)

  // Dialogs
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const [logoutLoading, setLogoutLoading] = useState(false)

  const notifications = [
    {
      label: "DNS verification complete",
      description: "Get notified when your domain DNS records are verified.",
      checked: notifDns,
      onChange: setNotifDns,
    },
    {
      label: "Account suspension alerts",
      description: "Get notified if your account is at risk of suspension.",
      checked: notifSuspension,
      onChange: setNotifSuspension,
    },
  ]

  async function handleSaveProfile() {
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = "Name is required"
    if (!email.trim()) {
      errors.email = "Email is required"
    } else if (!isValidEmail(email.trim())) {
      errors.email = "Invalid email address"
    }
    setProfileErrors(errors)
    if (Object.keys(errors).length > 0) return

    setProfileSaving(true)
    try {
      await updateUser({ name, email })
      toast({ type: "success", title: "Profile updated!" })
    } catch {
      toast({ type: "error", title: "Failed to update profile" })
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleUpdatePassword() {
    const errors: Record<string, string> = {}
    if (!currentPassword) errors.current = "Current password is required"
    if (!newPassword) {
      errors.new = "New password is required"
    } else if (newPassword.length < 8) {
      errors.new = "Password must be at least 8 characters"
    }
    if (!confirmPassword) {
      errors.confirm = "Please confirm your new password"
    } else if (confirmPassword !== newPassword) {
      errors.confirm = "Passwords do not match"
    }
    setPasswordErrors(errors)
    if (Object.keys(errors).length > 0) return

    setPasswordSaving(true)
    try {
      await updatePassword(currentPassword, newPassword)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast({ type: "success", title: "Password updated!" })
    } catch {
      toast({ type: "error", title: "Failed to update password" })
    } finally {
      setPasswordSaving(false)
    }
  }

  async function handleDeleteAccount() {
    setDeleteLoading(true)
    try {
      await deleteAccount()
      await logout()
      navigate("/")
    } catch {
      toast({ type: "error", title: "Failed to delete account" })
      setDeleteLoading(false)
      setShowDeleteDialog(false)
    }
  }

  async function handleLogout() {
    setLogoutLoading(true)
    try {
      await logout()
      navigate("/login")
    } catch {
      setLogoutLoading(false)
      setShowLogoutDialog(false)
    }
  }

  return (
    <div className="space-y-8">
      <Breadcrumb items={[{ label: "Settings" }]} />

      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account preferences and security.
        </p>
      </div>

      {/* Profile card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-border bg-card p-6"
      >
        <h3 className="text-base font-semibold text-foreground mb-5">Profile</h3>
        <div className="space-y-4">
          <FormField label="Full name" error={profileErrors.name || null}>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (profileErrors.name) setProfileErrors((p) => ({ ...p, name: "" }))
              }}
            />
          </FormField>
          <FormField label="Email" error={profileErrors.email || null}>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (profileErrors.email) setProfileErrors((p) => ({ ...p, email: "" }))
              }}
            />
          </FormField>
          <div className="flex justify-end pt-1">
            <Button onClick={handleSaveProfile} disabled={profileSaving}>
              {profileSaving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Password card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className="rounded-xl border border-border bg-card p-6"
      >
        <h3 className="text-base font-semibold text-foreground mb-5">Password</h3>
        <div className="space-y-4">
          <FormField label="Current password" error={passwordErrors.current || null}>
            <PasswordInput
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value)
                if (passwordErrors.current) setPasswordErrors((p) => ({ ...p, current: "" }))
              }}
              placeholder="Enter current password"
            />
          </FormField>
          <FormField label="New password" error={passwordErrors.new || null}>
            <PasswordInput
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value)
                if (passwordErrors.new) setPasswordErrors((p) => ({ ...p, new: "" }))
              }}
              placeholder="Enter new password"
            />
            <PasswordStrength password={newPassword} />
          </FormField>
          <FormField label="Confirm password" error={passwordErrors.confirm || null}>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                if (passwordErrors.confirm) setPasswordErrors((p) => ({ ...p, confirm: "" }))
              }}
              placeholder="Confirm new password"
            />
          </FormField>
          <div className="flex justify-end pt-1">
            <Button onClick={handleUpdatePassword} disabled={passwordSaving}>
              {passwordSaving ? "Updating..." : "Update password"}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Notifications card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.16 }}
        className="rounded-xl border border-border bg-card p-6"
      >
        <h3 className="text-base font-semibold text-foreground mb-4">Notifications</h3>
        <div>
          {notifications.map((item, i) => (
            <div
              key={item.label}
              className={cn(
                "flex items-center justify-between py-3",
                i < notifications.length - 1 && "border-b border-border/50"
              )}
            >
              <div>
                <p className="text-sm text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.description}
                </p>
              </div>
              <Switch checked={item.checked} onChange={item.onChange} aria-label={item.label} />
            </div>
          ))}
        </div>
      </motion.div>

      {/* Danger zone */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.24 }}
        className="rounded-xl border border-status-error/30 p-6"
      >
        <h3 className="text-base font-semibold text-status-error mb-2">
          Delete account
        </h3>
        <p className="text-sm text-muted-foreground mb-5">
          Permanently delete your account and all associated data. This action
          cannot be undone.
        </p>
        <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
          Delete my account
        </Button>
      </motion.div>

      {/* Logout */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.32 }}
        className="flex justify-start"
      >
        <Button variant="ghost" onClick={() => setShowLogoutDialog(true)}>
          <LogOut className="h-4 w-4" /> Log out
        </Button>
      </motion.div>

      {/* Delete account dialog */}
      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Delete your account?"
        description="This will permanently delete all your domains, email addresses, and data. This action cannot be undone."
        confirmLabel="Delete my account"
        confirmVariant="destructive"
        onConfirm={handleDeleteAccount}
        loading={deleteLoading}
      />

      {/* Logout dialog */}
      <Dialog
        open={showLogoutDialog}
        onClose={() => setShowLogoutDialog(false)}
        title="Log out?"
        description="You'll need to sign in again."
        confirmLabel="Log out"
        onConfirm={handleLogout}
        loading={logoutLoading}
      />
    </div>
  )
}
