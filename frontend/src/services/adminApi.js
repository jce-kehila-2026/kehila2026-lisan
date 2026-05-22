const getAdminHeaders = () => {
  const token = localStorage.getItem('lisan-token');

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
};

export const getStudents = async () => {
  const response = await fetch('/api/admin/students', {
    headers: getAdminHeaders(),
  });

  return parseResponse(response);
};

export const getStudent = async (id) => {
  const response = await fetch(`/api/admin/students/${id}`, {
    headers: getAdminHeaders(),
  });

  return parseResponse(response);
};

export const createStudent = async (student) => {
  const response = await fetch('/api/admin/students', {
    method: 'POST',
    headers: getAdminHeaders(),
    body: JSON.stringify(student),
  });

  return parseResponse(response);
};

export const updateStudent = async (id, student) => {
  const response = await fetch(`/api/admin/students/${id}`, {
    method: 'PUT',
    headers: getAdminHeaders(),
    body: JSON.stringify(student),
  });

  return parseResponse(response);
};

export const deleteStudent = async (id) => {
  const response = await fetch(`/api/admin/students/${id}`, {
    method: 'DELETE',
    headers: getAdminHeaders(),
  });

  return parseResponse(response);
};
