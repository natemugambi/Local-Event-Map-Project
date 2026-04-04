function initMap() {
  const center = { lat: 37.7749, lng: -122.4194 };

  const map = new google.maps.Map(document.getElementById("map"), {
    zoom: 13,
    center: center,
  });

  const marker = new google.maps.Marker({
    position: center,
    map: map,
    title: "Sample Event",
  });
}

window.onload = initMap;