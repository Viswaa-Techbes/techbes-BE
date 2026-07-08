const jobServiceV2 = require('../../services/jobServiceV2');

async function updateLocation(req, res, next) {
  try {
    const { lat, lng, latitude, longitude, isOnline } = req.body;
    
    // Support both lat/lng and latitude/longitude aliases
    const finalLat = Number(lat ?? latitude);
    const finalLng = Number(lng ?? longitude);

    console.log(`[LocationUpdate] Tech: ${req.user.id}, Lat: ${finalLat}, Lng: ${finalLng}, isOnline: ${isOnline}`);

    if (isNaN(finalLat) || isNaN(finalLng)) {
      return res.status(400).json({ success: false, message: 'Invalid coordinates' });
    }

    const loc = await jobServiceV2.updateLiveLocation(req.user.id, finalLat, finalLng);
    
    // Also update User model for basic tracking
    const User = require('../../models/User');
    await User.findByIdAndUpdate(req.user.id, {
      lat: finalLat,
      lng: finalLng,
      ...(isOnline !== undefined && { isOnline }),
      lastSeen: new Date()
    });

    // Broadcast to global or specific rooms
    const io = req.app.get('io');
    io.emit('technicianLocationUpdate', {
      technicianId: req.user.id,
      lat: finalLat,
      lng: finalLng,
      isOnline: isOnline ?? true
    });

    res.json({ success: true, data: loc });
  } catch (err) {
    next(err);
  }
}

async function getLiveLocation(req, res, next) {
  try {
    const { technicianId } = req.params;
    const loc = await jobServiceV2.getTechnicianLocation(technicianId);
    if (!loc) return res.status(404).json({ success: false, message: 'Location not found' });
    
    res.json({ success: true, data: loc });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  updateLocation,
  getLiveLocation,
};
