<script setup lang="ts">
/**
 * WorkspaceModal – Gestione workspace condiviso
 * ─────────────────────────────────────────────────────────────────────
 * Permette di:
 *   - Creare un nuovo workspace (prima volta o nuovo cantiere)
 *   - Invitare un membro tramite email
 *   - Vedere i membri attuali
 *   - Rimuovere un membro (solo il proprietario)
 *   - Disconnettersi dal workspace
 *
 * Usato in due modalità:
 *   1. forceOpen = true → schermata obbligatoria al primo accesso
 *   2. forceOpen = false → modal accessibile dalla sidebar
 */
import { ref, computed, onMounted } from 'vue'
import { useAppState }  from '~/composables/useAppState'
import { useAuth }      from '~/composables/useAuth'
import { useStore }     from '~/composables/useStore'
import {
  fetchWorkspace,
  createWorkspace  as firestoreCreateWorkspace,
  inviteMember     as firestoreInviteMember,
  removeMember     as firestoreRemoveMember,
} from '~/services/firestore'
import type { Workspace } from '~/types'

const props = withDefaults(defineProps<{ forceOpen?: boolean }>(), { forceOpen: false })
const emit  = defineEmits<{ (e: 'workspace-ready', id: string): void }>()

const appState = useAppState()
const auth     = useAuth()
const store    = useStore()

// ── Stato ────────────────────────────────────────────────────────────
const isLoading  = ref(false)
const feedback   = ref<{ ok: boolean; msg: string } | null>(null)
const workspace  = ref<Workspace | null>(null)

// Form "crea workspace"
const newWsName  = ref('')

// Form "invita membro"
const inviteEmail = ref('')

// ── Computed ─────────────────────────────────────────────────────────
const isOwner = computed(() =>
  workspace.value?.ownerId === auth.currentUser.value?.uid
)

const isVisible = computed(() =>
  props.forceOpen || appState.isWorkspaceModalOpen.value
)

// ── Init ─────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadWorkspace()
})

async function loadWorkspace(): Promise<void> {
  const wid = appState.activeWorkspaceId.value
  if (!wid) { workspace.value = null; return }
  workspace.value = await fetchWorkspace(wid)
}

// ── Azioni ───────────────────────────────────────────────────────────

/** Crea un nuovo workspace e lo attiva. */
async function createWorkspace(): Promise<void> {
  if (!newWsName.value.trim()) {
    feedback.value = { ok: false, msg: 'Inserisci un nome per il workspace.' }
    return
  }
  const user = auth.currentUser.value
  if (!user) return

  feedback.value  = null
  isLoading.value = true
  try {
    const wid = await firestoreCreateWorkspace(
      newWsName.value.trim(),
      user.uid,
      user.email,
    )
    appState.setActiveWorkspace(wid, newWsName.value.trim())
    await store.initWorkspace(wid)
    await loadWorkspace()
    newWsName.value = ''
    feedback.value  = { ok: true, msg: 'Workspace creato con successo!' }
    emit('workspace-ready', wid)
  } catch (e) {
    feedback.value = { ok: false, msg: e instanceof Error ? e.message : 'Errore.' }
  } finally {
    isLoading.value = false
  }
}

/** Invita un membro tramite email. */
async function inviteMember(): Promise<void> {
  const email = inviteEmail.value.trim().toLowerCase()
  if (!email) { feedback.value = { ok: false, msg: 'Inserisci un\'email.' }; return }
  const wid = appState.activeWorkspaceId.value
  if (!wid) return

  feedback.value  = null
  isLoading.value = true
  try {
    await firestoreInviteMember(wid, email)
    feedback.value   = { ok: true, msg: `Invito inviato a ${email}. Quando accede con quell'email, potrà accedere al workspace.` }
    inviteEmail.value = ''
    await loadWorkspace()
  } catch (e) {
    feedback.value = { ok: false, msg: e instanceof Error ? e.message : 'Errore invio invito.' }
  } finally {
    isLoading.value = false
  }
}

/** Rimuove un membro (solo proprietario). */
async function removeMember(uid: string, email: string): Promise<void> {
  if (!confirm(`Rimuovere ${email} dal workspace?`)) return
  const wid = appState.activeWorkspaceId.value
  if (!wid) return

  feedback.value  = null
  isLoading.value = true
  try {
    await firestoreRemoveMember(wid, uid, email)
    await loadWorkspace()
    feedback.value = { ok: true, msg: `${email} rimosso.` }
  } catch (e) {
    feedback.value = { ok: false, msg: e instanceof Error ? e.message : 'Errore.' }
  } finally {
    isLoading.value = false
  }
}

/** Abbandona il workspace corrente (torna alla selezione). */
function leaveWorkspace(): void {
  if (!confirm('Sei sicuro di voler uscire dal workspace? I tuoi dati locali rimarranno invariati.')) return
  store.clearWorkspace()
  appState.clearActiveWorkspace()
  workspace.value = null
  feedback.value  = null
}

function close(): void {
  if (!props.forceOpen) appState.closeWorkspaceModal()
}
</script>

<template>
  <Teleport to="body">
    <!-- Overlay ───────────────────────────────────────────────────── -->
    <div
      v-if="isVisible"
      class="ws-overlay"
      :class="{ force: forceOpen }"
      @click.self="close"
    >
      <div class="ws-modal">

        <!-- Header ──────────────────────────────────────────────── -->
        <div class="ws-header">
          <div class="ws-header-title">
            <svg viewBox="0 0 24 24" class="ws-icon">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
            Workspace
          </div>
          <button v-if="!forceOpen" class="ws-close-btn" @click="close">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Body ────────────────────────────────────────────────── -->
        <div class="ws-body">

          <!-- Feedback ───────────────────────────────────────────── -->
          <div
            v-if="feedback"
            class="ws-feedback"
            :class="{ ok: feedback.ok, err: !feedback.ok }"
          >{{ feedback.msg }}</div>

          <!-- Loading ────────────────────────────────────────────── -->
          <div v-if="isLoading" class="ws-loading">
            <span class="ws-spinner" />
            Elaborazione in corso…
          </div>

          <!-- Workspace attivo ────────────────────────────────────── -->
          <div v-if="workspace" class="ws-section">
            <div class="ws-section-title">Workspace attivo</div>
            <div class="ws-name-badge">
              🏗 {{ workspace.name }}
              <span v-if="isOwner" class="ws-owner-badge">proprietario</span>
            </div>

            <!-- Membri ─────────────────────────────────────────── -->
            <div class="ws-subsection-title">Membri ({{ workspace.memberEmails.length }})</div>
            <div class="ws-members">
              <div
                v-for="email in workspace.memberEmails"
                :key="email"
                class="ws-member-row"
              >
                <div class="ws-member-avatar">{{ email[0].toUpperCase() }}</div>
                <span class="ws-member-email">{{ email }}</span>
                <span v-if="email === workspace.ownerEmail" class="ws-role-badge">admin</span>
                <button
                  v-else-if="isOwner"
                  class="ws-remove-btn"
                  @click="removeMember(workspace!.members[workspace!.memberEmails.indexOf(email)], email)"
                  title="Rimuovi membro"
                >✕</button>
              </div>
            </div>

            <!-- Inviti pendenti ─────────────────────────────────── -->
            <div v-if="workspace.pendingInvites.length" class="ws-pending">
              <div class="ws-subsection-title">In attesa di accettazione</div>
              <div v-for="inv in workspace.pendingInvites" :key="inv" class="ws-pending-item">
                ⏳ {{ inv }}
              </div>
            </div>

            <!-- Invita membro ──────────────────────────────────── -->
            <div v-if="isOwner" class="ws-invite-form">
              <div class="ws-subsection-title">Invita un membro</div>
              <div class="ws-invite-row">
                <input
                  v-model="inviteEmail"
                  type="email"
                  class="ws-input"
                  placeholder="membro@azienda.it"
                  :disabled="isLoading"
                  @keyup.enter="inviteMember"
                />
                <button
                  class="ws-btn ws-btn-primary"
                  :disabled="isLoading"
                  @click="inviteMember"
                >Invita</button>
              </div>
              <p class="ws-invite-hint">
                L'utente invitato accede con Google o email usando quell'indirizzo
                e vedrà automaticamente i dati di questo workspace.
              </p>
            </div>

            <!-- Esci dal workspace ──────────────────────────────── -->
            <button
              v-if="!forceOpen"
              class="ws-btn ws-btn-danger"
              style="margin-top: 8px"
              @click="leaveWorkspace"
            >
              Esci dal workspace
            </button>
          </div>

          <!-- Nessun workspace – Crea nuovo ──────────────────────── -->
          <div v-else class="ws-section">
            <div class="ws-section-title">
              {{ forceOpen ? 'Benvenuto in PosaTrack' : 'Crea un workspace' }}
            </div>
            <p class="ws-intro">
              Un <strong>workspace</strong> è lo spazio condiviso dove vengono
              salvati tutti i dati del cantiere. Puoi invitare altri utenti
              che potranno accedervi con il loro account Google o email.
            </p>

            <label class="ws-label">Nome workspace (es. "Pozza Impianti")</label>
            <input
              v-model="newWsName"
              type="text"
              class="ws-input"
              placeholder="Nome azienda o cantiere"
              :disabled="isLoading"
              @keyup.enter="createWorkspace"
            />
            <button
              class="ws-btn ws-btn-primary"
              style="margin-top: 10px"
              :disabled="isLoading || !newWsName.trim()"
              @click="createWorkspace"
            >
              <span v-if="isLoading" class="ws-spinner ws-spinner-sm" />
              Crea workspace
            </button>
          </div>

        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.ws-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 16px;

  &.force {
    background: var(--bg);
    align-items: flex-start;
    padding-top: 60px;
  }
}

.ws-modal {
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: var(--r);
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

// ── Header ─────────────────────────────────────────────────────────
.ws-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.ws-header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.ws-icon {
  width: 20px; height: 20px;
  stroke: var(--muted); fill: none;
  stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
}

.ws-close-btn {
  width: 32px; height: 32px;
  border: none; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--r-sm); color: var(--muted);
  transition: background .12s, color .12s;

  &:hover { background: var(--surface2); color: var(--text); }

  svg {
    width: 16px; height: 16px;
    stroke: currentColor; fill: none;
    stroke-width: 2; stroke-linecap: round;
  }
}

// ── Body ────────────────────────────────────────────────────────────
.ws-body {
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ws-section { display: flex; flex-direction: column; gap: 12px; }

.ws-section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .6px;
  color: var(--muted);
}

.ws-subsection-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  margin-top: 4px;
}

.ws-intro {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
  margin: 0;

  strong { color: var(--text); }
}

// ── Workspace name badge ─────────────────────────────────────────────
.ws-name-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface2);
  border-radius: var(--r-sm);
  padding: 10px 14px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.ws-owner-badge {
  font-size: 10px;
  background: rgba(255,95,0,.15);
  color: var(--orange);
  padding: 2px 7px;
  border-radius: 10px;
  font-weight: 500;
  margin-left: auto;
}

// ── Members ─────────────────────────────────────────────────────────
.ws-members {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ws-member-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--surface2);
  border-radius: var(--r-sm);
}

.ws-member-avatar {
  width: 30px; height: 30px;
  border-radius: 50%;
  background: rgba(255,95,0,.2);
  color: var(--orange);
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ws-member-email {
  font-size: 13px;
  color: var(--text);
  flex: 1;
  word-break: break-all;
}

.ws-role-badge {
  font-size: 10px;
  color: var(--muted);
  background: var(--surface3);
  padding: 2px 6px;
  border-radius: 4px;
}

.ws-remove-btn {
  background: none;
  border: none;
  color: var(--red);
  cursor: pointer;
  padding: 2px 6px;
  font-size: 12px;
  border-radius: 4px;
  transition: background .12s;

  &:hover { background: rgba(239,68,68,.12); }
}

// ── Pending invites ──────────────────────────────────────────────────
.ws-pending {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ws-pending-item {
  font-size: 12px;
  color: var(--muted);
  background: var(--surface2);
  padding: 7px 12px;
  border-radius: var(--r-sm);
}

// ── Invite form ──────────────────────────────────────────────────────
.ws-invite-form { display: flex; flex-direction: column; gap: 8px; }

.ws-invite-row {
  display: flex;
  gap: 8px;

  .ws-input { flex: 1; }
}

.ws-invite-hint {
  font-size: 11px;
  color: var(--dim);
  line-height: 1.5;
  margin: 0;
}

// ── Label & Input ────────────────────────────────────────────────────
.ws-label {
  font-size: 13px;
  color: var(--muted);
}

.ws-input {
  width: 100%;
  background: var(--surface2);
  border: 1px solid var(--border2);
  border-radius: var(--r-sm);
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text);
  font-family: 'DM Sans', sans-serif;
  outline: none;
  transition: border-color .15s;

  &:focus { border-color: var(--orange); }
  &:disabled { opacity: .5; }
  &::placeholder { color: var(--dim); }
}

// ── Buttons ─────────────────────────────────────────────────────────
.ws-btn {
  padding: 10px 16px;
  border-radius: var(--r-sm);
  font-size: 14px;
  font-weight: 500;
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  border: none;
  white-space: nowrap;
  transition: background .12s, opacity .12s;

  &:disabled { opacity: .45; cursor: default; }
}

.ws-btn-primary {
  background: var(--orange);
  color: #fff;
  &:not(:disabled):hover { background: var(--orange-d); }
}

.ws-btn-danger {
  background: rgba(239,68,68,.12);
  color: var(--red);
  border: 1px solid rgba(239,68,68,.25);
  &:not(:disabled):hover { background: rgba(239,68,68,.2); }
}

// ── Feedback ─────────────────────────────────────────────────────────
.ws-feedback {
  padding: 9px 12px;
  border-radius: var(--r-sm);
  font-size: 13px;
  line-height: 1.4;

  &.ok  { background: rgba(34,197,94,.1);  color: var(--green); }
  &.err { background: rgba(239,68,68,.1);  color: var(--red);   }
}

// ── Loading ──────────────────────────────────────────────────────────
.ws-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--orange);
}

.ws-spinner {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid rgba(255,95,0,.3);
  border-top-color: var(--orange);
  border-radius: 50%;
  animation: spin .7s linear infinite;
}

.ws-spinner-sm {
  width: 12px; height: 12px;
  border-color: rgba(255,255,255,.3);
  border-top-color: #fff;
}
</style>
