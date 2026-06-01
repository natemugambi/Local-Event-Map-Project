function initMap() {
  // Center map between SF and Oakland
  const bayArea = { lat: 37.789, lng: -122.35 };

  // Create the map
  const map = new google.maps.Map(document.getElementById("map"), {
    zoom: 11,
    center: bayArea,
  });

  // Categories include: Corporate & Professional, Conferences & Seminars, Festivals & Entertainment, Special Occasions, and Community Gatherings.

  // Event data
  const events = [
    {
      name: "Black Art Showcase",
      category: "Festivals & Entertainment",
      lat: 37.7749,
      lng: -122.4194,
      city: "San Francisco",
    },
    {
      name: "Oakland Community Cookout",
      category: "Community Gatherings",
      lat: 37.8044,
      lng: -122.2712,
      city: "Oakland",
    },
    {
      name: "Afrobeats Night",
      category: "Festivals & Entertainment",
      lat: 37.7849,
      lng: -122.4094,
      city: "San Francisco",
    },
  ];

  // Loop through each event and create a marker
  events.forEach(function(event) {
    const marker = new google.maps.Marker({
      position: {
        lat: event.lat,
        lng: event.lng,
      },
      map: map,
      title: event.name,
    });

    // Popup when marker is clicked
    const infoWindow = new google.maps.InfoWindow({
      content: `
        <h3>${event.name}</h3>
        <p>${event.city}</p>
      `,
    });

    marker.addListener("click", function() {
      infoWindow.open(map, marker);
    });
  });
}