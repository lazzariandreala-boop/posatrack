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
  createWorkspace    as firestoreCreateWorkspace,
  deleteWorkspace    as firestoreDeleteWorkspace,
  inviteMember       as firestoreInviteMember,
  removeMember       as firestoreRemoveMember,
  fetchUserWorkspaces,
  joinWorkspace      as firestoreJoinWorkspace,
  joinWorkspaceByCode as firestoreJoinByCode,
  type WorkspaceListItem,
} from '~/services/firestore'
import type { Workspace } from '~/types'

const props = withDefaults(defineProps<{ forceOpen?: boolean }>(), { forceOpen: false })
const emit  = defineEmits<{ (e: 'workspace-ready', id: string): void }>()

const appState = useAppState()
const auth     = useAuth()
const store    = useStore()

// ── Stato ────────────────────────────────────────────────────────────
const isLoading          = ref(false)
const feedback           = ref<{ ok: boolean; msg: string } | null>(null)
const workspace          = ref<Workspace | null>(null)

// Lista workspace disponibili (caricata al mount quando non c'è workspace attivo)
const availableWorkspaces  = ref<WorkspaceListItem[]>([])
// Inizia true se non c'è workspace attivo: evita il flash del form "Crea"
// prima che onMounted esegua fetchUserWorkspaces
const loadingWorkspaces    = ref(!appState.activeWorkspaceId.value)
const showCreateForm       = ref(false)
// Workspace in attesa di conferma eliminazione (null = nessuno)
const pendingDeleteItem    = ref<WorkspaceListItem | null>(null)

// Form "crea workspace"
const newWsName  = ref('')

// Form "invita membro"
const inviteEmail = ref('')

// Flusso codice invito manuale (fallback quando la query pendingInvites fallisce)
const showInviteCode = ref(false)
const inviteCode     = ref('')

// ── Computed ─────────────────────────────────────────────────────────
const isOwner = computed(() =>
  workspace.value?.ownerId === auth.currentUser.value?.uid
)

const isVisible = computed(() =>
  props.forceOpen || appState.isWorkspaceModalOpen.value
)

// ── Init ─────────────────────────────────────────────────────────────
onMounted(async () => {
  const wid = appState.activeWorkspaceId.value
  if (wid) {
    await loadWorkspace()
  } else {
    await loadAvailableWorkspaces()
  }
})

async function loadWorkspace(): Promise<void> {
  const wid = appState.activeWorkspaceId.value
  if (!wid) { workspace.value = null; return }
  workspace.value = await fetchWorkspace(wid)
}

async function loadAvailableWorkspaces(): Promise<void> {
  const user = auth.currentUser.value
  if (!user) return
  loadingWorkspaces.value = true
  try {
    availableWorkspaces.value = await fetchUserWorkspaces(user.uid, user.email ?? '')
    // Mostra il form "Crea" solo se Firestore ha risposto con lista vuota
    if (availableWorkspaces.value.length === 0) showCreateForm.value = true
  } catch (e) {
    // Errore inaspettato: mostra un feedback ma NON va direttamente a "Crea"
    // per evitare che un errore di rete nasconda workspace esistenti
    console.error('[WorkspaceModal] loadAvailableWorkspaces error:', e)
    feedback.value = { ok: false, msg: 'Impossibile caricare i workspace. Riprova.' }
  } finally {
    loadingWorkspaces.value = false
  }
}

/** Disconnette l'utente e ritorna alla schermata di login. */
async function handleLogout(): Promise<void> {
  await auth.logout()
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

/** Entra in un workspace esistente (membro già presente o invito pendente). */
async function enterWorkspace(item: WorkspaceListItem): Promise<void> {
  const user = auth.currentUser.value
  if (!user) return
  feedback.value  = null
  isLoading.value = true
  try {
    if (item.isPending) {
      await firestoreJoinWorkspace(item.id, user.uid, user.email ?? '')
    }
    appState.setActiveWorkspace(item.id, item.name)
    await store.initWorkspace(item.id)
    await loadWorkspace()
    emit('workspace-ready', item.id)
  } catch (e) {
    feedback.value = { ok: false, msg: e instanceof Error ? e.message : 'Errore.' }
  } finally {
    isLoading.value = false
  }
}

/**
 * Entra in un workspace inserendo manualmente l'ID (codice invito).
 * Fallback per quando la query automatica su pendingInvites è bloccata
 * dalle regole Firestore non ancora deployate.
 */
async function joinByCode(): Promise<void> {
  const user = auth.currentUser.value
  const wid  = inviteCode.value.trim()
  if (!user || !wid) return
  feedback.value  = null
  isLoading.value = true
  try {
    const result = await firestoreJoinByCode(wid, user.uid, user.email ?? '')
    if (result.success) {
      const name = result.name ?? wid
      appState.setActiveWorkspace(wid, name)
      await store.initWorkspace(wid)
      emit('workspace-ready', wid)
    } else {
      feedback.value = { ok: false, msg: 'Nessun invito trovato per la tua email in questo workspace. Verifica l\'ID e chiedi al proprietario di reinvitarti.' }
    }
  } catch (e) {
    feedback.value = { ok: false, msg: e instanceof Error ? e.message : 'Errore.' }
  } finally {
    isLoading.value = false
  }
}

/** Elimina un workspace (solo il proprietario). */
async function executeDeleteWorkspace(): Promise<void> {
  const item = pendingDeleteItem.value
  if (!item) return
  pendingDeleteItem.value = null
  isLoading.value = true
  feedback.value  = null
  try {
    await firestoreDeleteWorkspace(item.id)
    // Ricarica la lista aggiornata
    await loadAvailableWorkspaces()
    feedback.value = { ok: true, msg: `Workspace "${item.name}" eliminato.` }
  } catch (e) {
    feedback.value = { ok: false, msg: e instanceof Error ? e.message : 'Errore durante l\'eliminazione.' }
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
          <!-- Close (modal secondario) o Logout (gate obbligatorio) -->
          <button v-if="forceOpen" class="ws-logout-btn" @click="handleLogout" title="Esci dall'account">
            <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Esci
          </button>
          <button v-else class="ws-close-btn" @click="close">
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

          <!-- Nessun workspace attivo ─────────────────────────────── -->
          <div v-else class="ws-section">

            <!-- Caricamento lista ──────────────────────────────────── -->
            <div v-if="loadingWorkspaces" class="ws-loading">
              <span class="ws-spinner" /> Ricerca workspace…
            </div>

            <template v-else>

              <!-- Selezione workspace disponibili ──────────────────── -->
              <template v-if="availableWorkspaces.length > 0 && !showCreateForm">
                <div class="ws-section-title">I tuoi workspace</div>

                <!-- Dialog conferma eliminazione -->
                <div v-if="pendingDeleteItem" class="ws-delete-confirm">
                  <div class="ws-delete-confirm-text">
                    Eliminare <strong>{{ pendingDeleteItem.name }}</strong>?
                    Tutti i dati associati verranno eliminati permanentemente.
                  </div>
                  <div class="ws-delete-confirm-actions">
                    <button class="ws-btn" @click="pendingDeleteItem = null">Annulla</button>
                    <button class="ws-btn ws-btn-danger" :disabled="isLoading" @click="executeDeleteWorkspace">
                      <span v-if="isLoading" class="ws-spinner ws-spinner-sm" />
                      Elimina
                    </button>
                  </div>
                </div>

                <div class="ws-avail-list">
                  <div
                    v-for="item in availableWorkspaces"
                    :key="item.id"
                    class="ws-avail-item"
                    :class="{ 'ws-avail-item--deleting': pendingDeleteItem?.id === item.id }"
                  >
                    <div class="ws-avail-info">
                      <div class="ws-avail-name">🏗 {{ item.name }}</div>
                      <div class="ws-avail-meta">
                        {{ item.memberCount }} {{ item.memberCount === 1 ? 'membro' : 'membri' }}
                        · {{ item.ownerEmail }}
                        <span v-if="item.isPending" class="ws-invite-tag">invito</span>
                      </div>
                    </div>
                    <div class="ws-avail-actions">
                      <button
                        class="ws-btn ws-btn-primary ws-btn-sm"
                        :disabled="isLoading"
                        @click="enterWorkspace(item)"
                      >
                        {{ item.isPending ? 'Accetta invito' : 'Entra' }}
                      </button>
                      <!-- Elimina: solo il proprietario può vederlo -->
                      <button
                        v-if="!item.isPending && item.ownerId === auth.currentUser.value?.uid"
                        class="ws-delete-btn"
                        :disabled="isLoading"
                        title="Elimina workspace"
                        @click="pendingDeleteItem = item"
                      >
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6"/></svg>
                      </button>
                    </div>
                  </div>
                </div>

                <div class="ws-divider"><span>oppure</span></div>
                <button class="ws-new-link" @click="showCreateForm = true">
                  + Crea un nuovo workspace
                </button>

                <!-- Fallback codice invito manuale -->
                <button class="ws-new-link" style="color: var(--muted)" @click="showInviteCode = !showInviteCode">
                  {{ showInviteCode ? '− Nascondi' : '+ Ho un codice invito' }}
                </button>
                <div v-if="showInviteCode" class="ws-code-form">
                  <label class="ws-label">ID Workspace (chiederlo al proprietario)</label>
                  <div class="ws-invite-row">
                    <input
                      v-model="inviteCode"
                      type="text"
                      class="ws-input"
                      placeholder="Incolla l'ID workspace..."
                      :disabled="isLoading"
                      @keyup.enter="joinByCode"
                    />
                    <button
                      class="ws-btn ws-btn-primary ws-btn-sm"
                      :disabled="isLoading || !inviteCode.trim()"
                      @click="joinByCode"
                    >
                      <span v-if="isLoading" class="ws-spinner ws-spinner-sm" />
                      Entra
                    </button>
                  </div>
                </div>
              </template>

              <!-- Form crea workspace ───────────────────────────────── -->
              <template v-else>
                <div class="ws-section-title">
                  {{ availableWorkspaces.length === 0 ? 'Nessun workspace trovato' : 'Nuovo workspace' }}
                </div>

                <p class="ws-intro">
                  Un <strong>workspace</strong> è lo spazio condiviso dove vengono
                  salvati tutti i dati del cantiere. Puoi invitare altri utenti
                  che potranno accedervi con il loro account Google o email.
                </p>

                <button
                  v-if="availableWorkspaces.length > 0"
                  class="ws-back-link"
                  @click="showCreateForm = false"
                >← Torna alla selezione</button>

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
              </template>

            </template>
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

.ws-logout-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border2);
  background: transparent;
  border-radius: var(--r-sm);
  color: var(--muted);
  font-size: 13px;
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  transition: background .12s, color .12s;

  &:hover { background: var(--surface2); color: var(--text); }

  svg {
    width: 15px; height: 15px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  }
}

.ws-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0;
  color: var(--dim);
  font-size: 11px;

  &::before, &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
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

// ── Available workspaces list ────────────────────────────────────────
.ws-avail-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ws-avail-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface2);
  border: 1px solid var(--border2);
  border-radius: var(--r-sm);
  transition: border-color .15s;

  &--deleting { border-color: var(--red); }
}

.ws-avail-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.ws-avail-info {
  flex: 1;
  min-width: 0;
}

.ws-avail-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-avail-meta {
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
}

.ws-invite-tag {
  display: inline-block;
  background: rgba(255,95,0,.15);
  color: var(--orange);
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 4px;
  text-transform: uppercase;
  letter-spacing: .3px;
}

.ws-btn-sm {
  padding: 7px 14px;
  font-size: 13px;
  flex-shrink: 0;
}

.ws-delete-btn {
  width: 30px; height: 30px;
  border: 1px solid var(--border2);
  background: transparent;
  border-radius: var(--r-xs);
  color: var(--muted);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .12s, color .12s, border-color .12s;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: rgba(239,68,68,.12);
    color: var(--red);
    border-color: rgba(239,68,68,.4);
  }

  &:disabled { opacity: .4; cursor: default; }

  svg {
    width: 14px; height: 14px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  }
}

.ws-delete-confirm {
  background: rgba(239,68,68,.08);
  border: 1px solid rgba(239,68,68,.3);
  border-radius: var(--r-sm);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ws-delete-confirm-text {
  font-size: 13px;
  color: var(--text);
  line-height: 1.5;

  strong { color: var(--red); }
}

.ws-delete-confirm-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.ws-new-link {
  background: none;
  border: none;
  color: var(--orange);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 0;
  font-family: 'DM Sans', sans-serif;
  text-align: left;

  &:hover { text-decoration: underline; }
}

.ws-back-link {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  padding: 0 0 4px;
  font-family: 'DM Sans', sans-serif;
  text-align: left;

  &:hover { color: var(--text); }
}

.ws-code-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--surface2);
  border: 1px solid var(--border2);
  border-radius: var(--r-sm);
  padding: 12px 14px;
}
</style>
