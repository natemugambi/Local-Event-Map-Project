const SERVER_URL = "https://local-event-map-project-production.up.railway.app";

// Check login
const stored = localStorage.getItem("tg_user");
if (!stored) window.location.href = "login.html?reason=auth";
const user = JSON.parse(stored);

loadMyEvents();

// ===== LOAD EVENTS =====
async function loadMyEvents() {
  const list = document.getElementById("my-events-list");
  list.innerHTML = `<p style="color:#666; text-align:center; padding:40px;">Loading your events...</p>`;

  try {
    const res = await fetch(`${SERVER_URL}/api/my-events/${user.userId}`);
    const events = await res.json();

    if (events.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <p>You haven't submitted any events yet.</p>
          <p style="margin-top:8px;"><a href="submit.html">+ Host your first event</a></p>
        </div>
      `;
      return;
    }

    list.innerHTML = "";
    events.forEach(event => {
      const card = document.createElement("div");
      card.className = "my-event-card";
      card.dataset.id = event.id;

      card.innerHTML = `
        <div class="my-event-card-header">
          <div class="my-event-card-category">${event.category}</div>
        </div>
        <h3>${event.name}</h3>
        <div class="my-event-card-meta">
          <span>📅 ${event.date} · ${event.time}</span>
          <span>📍 ${event.venue}, ${event.city}</span>
          ${event.url ? `<span>🔗 <a href="${event.url}" target="_blank" style="color:#c9a84c;">${event.url}</a></span>` : ""}
        </div>
        <div class="my-event-card-actions">
          <button class="btn-edit" data-id="${event.id}">Edit</button>
          <button class="btn-delete" data-id="${event.id}">Delete</button>
        </div>
      `;

      // Edit button
      card.querySelector(".btn-edit").addEventListener("click", () => openEditModal(event));

      // Delete button
      card.querySelector(".btn-delete").addEventListener("click", () => deleteEvent(event.id, card));

      list.appendChild(card);
    });
  } catch (err) {
    console.error("Failed to load events:", err);
    list.innerHTML = `<p style="color:#888; text-align:center; padding:40px;">Could not load your events.</p>`;
  }
}

// ===== DELETE =====
async function deleteEvent(id, card) {
  if (!confirm("Are you sure you want to delete this event?")) return;

  try {
    const res = await fetch(`${SERVER_URL}/api/submitted-events/${id}?user_id=${user.userId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error);
    }

    card.style.transition = "opacity 0.3s";
    card.style.opacity = "0";
    setTimeout(() => {
      card.remove();
      // Check if list is empty now
      const list = document.getElementById("my-events-list");
      if (!list.querySelector(".my-event-card")) {
        list.innerHTML = `
          <div class="empty-state">
            <p>You haven't submitted any events yet.</p>
            <p style="margin-top:8px;"><a href="submit.html">+ Host your first event</a></p>
          </div>
        `;
      }
    }, 300);
  } catch (err) {
    alert("Failed to delete: " + err.message);
  }
}

// ===== EDIT MODAL =====
const modal = document.getElementById("edit-modal");
const editForm = document.getElementById("edit-form");
const editCancel = document.getElementById("edit-cancel");
const editMessage = document.getElementById("edit-message");

function openEditModal(event) {
  document.getElementById("edit-id").value = event.id;
  document.getElementById("edit-name").value = event.name;
  document.getElementById("edit-category").value = event.category;
  document.getElementById("edit-date").value = event.date;
  document.getElementById("edit-time").value = event.time;
  document.getElementById("edit-venue").value = event.venue;
  document.getElementById("edit-city").value = event.city;
  document.getElementById("edit-url").value = event.url || "";
  editMessage.textContent = "";
  modal.classList.add("active");
}

editCancel.addEventListener("click", () => {
  modal.classList.remove("active");
});

modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.classList.remove("active");
});

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("edit-id").value;

  const payload = {
    name: document.getElementById("edit-name").value,
    category: document.getElementById("edit-category").value,
    date: document.getElementById("edit-date").value,
    time: document.getElementById("edit-time").value,
    venue: document.getElementById("edit-venue").value,
    city: document.getElementById("edit-city").value,
    url: document.getElementById("edit-url").value || null,
    user_id: user.userId,
  };

  try {
    const res = await fetch(`${SERVER_URL}/api/submitted-events/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error);
    }

    editMessage.textContent = "Event updated!";
    editMessage.className = "edit-message success";
    setTimeout(() => {
      modal.classList.remove("active");
      loadMyEvents();
    }, 800);
  } catch (err) {
    editMessage.textContent = err.message;
    editMessage.className = "edit-message error";
  }
});
