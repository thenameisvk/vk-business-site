import React, { useEffect } from 'react'
import { Outlet, Link } from 'react-router-dom'

import AdminHeader from '../components/AdminHeader'

function AdminLayout({ title }) {
  useEffect(() => {
    if (title) {
      document.title = title
    }
  }, [title])

  return (
    <div className="admin-layout ">
      <AdminHeader />
      <main  >
        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout