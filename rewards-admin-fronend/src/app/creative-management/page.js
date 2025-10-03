'use client';

import React, { useState, useEffect } from "react";
import { useSearch } from "../../contexts/SearchContext";
import { creativesData } from "./components/constants";
import Frame from "./components/Frame";
import UploadTable from "./components/UploadTable";
import TrackerTable from "./components/TrackerTable";
import AddEditCreativeModal from "./components/modals/AddEditCreativeModal";
import PreviewModal from "./components/modals/PreviewModal";
import ViewDetailsModal from "./components/modals/ViewDetailsModal";
import DeleteModal from "./components/modals/DeleteModal";


// Main Component
export default function CreativeManagementPage() {
  const { searchTerm, registerSearchHandler } = useSearch();
  const [activeTab, setActiveTab] = useState("upload");
  const [filters, setFilters] = useState({
    dateRange: null,
    placement: null,
    pid: null,
    segment: null,
    status: null,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [creativesDataState, setCreativesDataState] = useState(creativesData);
  const [modals, setModals] = useState({
    addEdit: false,
    preview: false,
    view: false,
    delete: false
  });
  const [selectedCreative, setSelectedCreative] = useState(null);
  const itemsPerPage = 10;

  useEffect(() => {
    registerSearchHandler((query) => {
      setCurrentPage(1);
    });
  }, [registerSearchHandler]);

  const handleFilterChange = (filterId, value) => {
    setFilters(prev => ({
      ...prev,
      [filterId]: value
    }));
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const filteredData = creativesDataState.filter(creative => {
    // Exclude soft-deleted items
    if (creative.isDeleted) return false;
    
    const matchesSearch = searchTerm === "" || 
      creative.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      creative.campaignPID.toLowerCase().includes(searchTerm.toLowerCase()) ||
      creative.placement.toLowerCase().includes(searchTerm.toLowerCase()) ||
      creative.segment.toLowerCase().includes(searchTerm.toLowerCase());
    
    // EXCLUDED: Placement, PID, and Segment filtering disabled per requirements
    // const matchesPlacement = !filters.placement || filters.placement === "All Placements" || creative.placement === filters.placement;
    // const matchesPID = !filters.pid || filters.pid === "All PIDs" || creative.campaignPID === filters.pid;
    // const matchesSegment = !filters.segment || filters.segment === "All Segments" ||
    //   creative.segment.split(', ').some(seg => seg.trim() === filters.segment);
    const matchesStatus = !filters.status || filters.status === "All Status" || creative.status === filters.status;
    
    // EXCLUDED: Only use search and status filtering per requirements
    return matchesSearch && matchesStatus;
  });

  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  // Modal handlers
  const openModal = (modalType, creative = null) => {
    setSelectedCreative(creative);
    setModals(prev => ({ ...prev, [modalType]: true }));
  };

  const closeModal = (modalType) => {
    setModals(prev => ({ ...prev, [modalType]: false }));
    setSelectedCreative(null);
  };

  const handleSave = (creativeData) => {
    if (selectedCreative) {
      // Edit existing
      setCreativesDataState(prev => 
        prev.map(creative => 
          creative.id === selectedCreative.id ? { ...creative, ...creativeData } : creative
        )
      );
    } else {
      // Add new
      setCreativesDataState(prev => [...prev, {
        ...creativeData,
        views: 0,
        clicks: 0,
        ctr: "0%"
      }]);
    }
  };


  const handleDelete = (creativeId) => {
    const auditEntry = {
      action: 'DELETE',
      adminId: 'admin_001',
      timestamp: new Date().toISOString()
    };
    
    setCreativesDataState(prev => 
      prev.map(creative => 
        creative.id === creativeId 
          ? { 
              ...creative, 
              isDeleted: true,
              auditLog: [...(creative.auditLog || []), auditEntry]
            }
          : creative
      )
    );
  };
  
  const handleToggle = (creative) => {
    const auditEntry = {
      action: 'TOGGLE_STATUS',
      adminId: 'admin_001',
      timestamp: new Date().toISOString()
    };
    
    setCreativesDataState(prev => 
      prev.map(c => 
        c.id === creative.id 
          ? { 
              ...c, 
              status: c.status === "Active" ? "Inactive" : "Active",
              auditLog: [...(c.auditLog || []), auditEntry]
            }
          : c
      )
    );
  };

  return (
    <div className="w-full p-6">
      <Frame 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        filters={filters}
        onFilterChange={handleFilterChange}
        onAddNew={() => openModal('addEdit')}
      />

      {/* EXCLUDED: Campaign Tracker functionality not supported per requirements - only show upload table */}
      <UploadTable
        data={paginatedData}
        onEdit={(creative) => openModal('addEdit', creative)}
        onDelete={(creative) => openModal('delete', creative)}
        onToggle={handleToggle}
        onPreview={(creative) => openModal('preview', creative)}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        onPageChange={handlePageChange}
      />

      {/* EXCLUDED: TrackerTable functionality removed per requirements
      {activeTab === "upload" ? (
        <UploadTable
          data={paginatedData}
          onEdit={(creative) => openModal('addEdit', creative)}
          onDelete={(creative) => openModal('delete', creative)}
          onToggle={handleToggle}
          onPreview={(creative) => openModal('preview', creative)}
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          onPageChange={handlePageChange}
        />
      ) : (
        <TrackerTable
          data={paginatedData}
          onView={(creative) => openModal('view', creative)}
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          onPageChange={handlePageChange}
        />
      )}
      */}

      {/* Modals */}
      <AddEditCreativeModal
        isOpen={modals.addEdit}
        onClose={() => closeModal('addEdit')}
        creative={selectedCreative}
        onSave={handleSave}
        existingCreatives={creativesDataState.filter(c => !c.isDeleted)}
      />

      <PreviewModal
        isOpen={modals.preview}
        onClose={() => closeModal('preview')}
        creative={selectedCreative}
      />

      <ViewDetailsModal
        isOpen={modals.view}
        onClose={() => closeModal('view')}
        creative={selectedCreative}
      />

      <DeleteModal
        isOpen={modals.delete}
        onClose={() => closeModal('delete')}
        creative={selectedCreative}
        onConfirm={handleDelete}
      />
    </div>
  );
}