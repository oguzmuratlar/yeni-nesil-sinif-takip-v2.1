import React, { useState, useEffect } from 'react';
import apiClient from '../../api/axios';
import AnnouncementTicker from '../announcements/AnnouncementTicker';
import AnnouncementModal from '../announcements/AnnouncementModal';

// Veli paneli duyuru alanı: kayar yazı + görülmemiş duyurular için otomatik popup.
const VeliAnnouncements = () => {
  const [list, setList] = useState([]);
  const [modalItems, setModalItems] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    apiClient.get('/parent/announcements')
      .then(r => setList(r.data || []))
      .catch(() => {});

    apiClient.get('/parent/announcements/unseen')
      .then(r => {
        const unseen = r.data || [];
        if (unseen.length > 0) {
          setModalItems(unseen);
          setOpen(true);
          unseen.forEach(a => {
            apiClient.post(`/parent/announcements/${a.id}/seen`).catch(() => {});
          });
        }
      })
      .catch(() => {});
  }, []);

  const openFromTicker = () => {
    setModalItems(list);
    setOpen(true);
  };

  if (list.length === 0) return null;

  return (
    <>
      <AnnouncementTicker announcements={list} variant="light" onClick={openFromTicker} />
      <AnnouncementModal items={modalItems} open={open} onOpenChange={setOpen} />
    </>
  );
};

export default VeliAnnouncements;
