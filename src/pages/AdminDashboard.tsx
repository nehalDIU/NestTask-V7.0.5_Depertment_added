import { useState, useEffect, useMemo } from 'react';
import { UserList } from '../components/admin/UserList';
import { TaskManager } from '../components/admin/TaskManager';
import { SideNavigation } from '../components/admin/navigation/SideNavigation';
import { TaskList } from '../components/TaskList';
import { UserStats } from '../components/admin/UserStats';
import { UserActivity } from '../components/admin/UserActivity';
import { AnnouncementManager } from '../components/admin/announcement/AnnouncementManager';
import { CourseManager } from '../components/admin/course/CourseManager';
import { StudyMaterialManager } from '../components/admin/study-materials/StudyMaterialManager';
import { RoutineManager } from '../components/admin/routine/RoutineManager';
import { TeacherManager } from '../components/admin/teacher/TeacherManager';
import { Dashboard } from '../components/admin/dashboard/Dashboard';
import { UserActiveGraph } from '../components/admin/dashboard/UserActiveGraph';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { useCourses } from '../hooks/useCourses';
import { useRoutines } from '../hooks/useRoutines';
import { useTeachers } from '../hooks/useTeachers';
import { useUsers } from '../hooks/useUsers';
import { showErrorToast } from '../utils/notifications';
import { isOverdue } from '../utils/dateUtils';
import type { User } from '../types/auth';
import type { Task } from '../types/index';
import type { NewTask } from '../types/task';
import type { Teacher, NewTeacher } from '../types/teacher';
import type { AdminTab } from '../types/admin';
import { useAuth } from '../hooks/useAuth';
import { useTasks } from '../hooks/useTasks';

interface AdminDashboardProps {
  users: User[];
  tasks: Task[];
  onLogout: () => void;
  onDeleteUser: (userId: string) => void;
  onCreateTask: (task: NewTask, sectionId?: string) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  isSectionAdmin?: boolean;
  sectionId?: string;
  sectionName?: string;
}

export function AdminDashboard({
  users = [],
  tasks,
  onLogout,
  onDeleteUser,
  onCreateTask,
  onDeleteTask,
  onUpdateTask,
  isSectionAdmin = false,
  sectionId,
  sectionName
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  
  // Get current user from auth for debugging
  const { user } = useAuth();
  const { refreshTasks } = useTasks(user?.id);
  
  // Filter tasks for section admin
  const filteredTasks = useMemo(() => {
    if (!isSectionAdmin || !sectionId) {
      return tasks;
    }
    
    // Debug log to check tasks and sectionId
    console.log('Section admin filtering tasks:', { 
      totalTasks: tasks.length,
      sectionId,
      taskWithSectionId: tasks.filter(t => t.sectionId === sectionId).length,
      allTaskSectionIds: tasks.map(t => t.sectionId)
    });
    
    // For section admins, only show tasks relevant to their section
    return tasks.filter(task => {
      // First, check if the task has a direct section ID assignment
      if (task.sectionId === sectionId) {
        return true;
      }
      
      // Fall back to the old way of checking for section relevance
      return users.some(u => 
        // Task is related to a user in the section admin's section
        u.sectionId === sectionId && 
        // Check if the task was likely created for/by this user
        (task.isAdminTask || task.description.includes(u.name) || task.name.includes(u.name))
      );
    });
  }, [tasks, isSectionAdmin, sectionId, users]);
  
  const { 
    announcements,
    createAnnouncement,
    deleteAnnouncement
  } = useAnnouncements();
  
  // Filter announcements for section admin
  const filteredAnnouncements = useMemo(() => {
    if (!isSectionAdmin || !sectionId) {
      return announcements;
    }
    
    // For section admins, only show general announcements
    // or ones specifically mentioning their section or users
    return announcements.filter(announcement => {
      // Check if announcement mentions section name or any user in the section
      const hasSectionMention = sectionName && 
        (announcement.title.includes(sectionName) || 
         announcement.content.includes(sectionName));
         
      // Check if any user from the section is mentioned
      const hasUserMention = users.some(user => 
        announcement.title.includes(user.name) || 
        announcement.content.includes(user.name)
      );
      
      return hasSectionMention || hasUserMention;
    });
  }, [announcements, isSectionAdmin, sectionId, sectionName, users]);
  
  const {
    courses,
    materials,
    createCourse,
    updateCourse,
    deleteCourse,
    createMaterial,
    updateMaterial,
    deleteMaterial,
    bulkImportCourses
  } = useCourses();

  const {
    routines,
    createRoutine,
    updateRoutine,
    deleteRoutine,
    addRoutineSlot,
    updateRoutineSlot,
    deleteRoutineSlot,
    activateRoutine,
    deactivateRoutine,
    bulkImportSlots
  } = useRoutines();

  const {
    teachers,
    createTeacher,
    updateTeacher,
    deleteTeacher: deleteTeacherService,
    bulkImportTeachers
  } = useTeachers();
  
  const { deleteUser } = useUsers();
  const dueTasks = tasks.filter(task => isOverdue(task.dueDate) && task.status !== 'completed');

  // Check for mobile view on mount and resize
  useEffect(() => {
    const checkMobileView = () => {
      setIsMobileView(window.innerWidth < 1024);
    };
    
    checkMobileView();
    window.addEventListener('resize', checkMobileView);
    
    return () => {
      window.removeEventListener('resize', checkMobileView);
    };
  }, []);

  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteUser(userId);
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  const handleToggleSidebar = (collapsed: boolean) => {
    setIsSidebarCollapsed(collapsed);
  };

  // Handle tab changes with refresh option
  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    
    // If navigating to tasks, show the task form and refresh tasks
    if (tab === 'tasks') {
      setShowTaskForm(true);
      // Refresh tasks to ensure we have the latest data, especially for section admins
      refreshTasks();
    } else {
      setShowTaskForm(false);
    }
  };

  // Create a wrapped onCreateTask function that refreshes after creation
  const handleCreateTask = async (taskData: NewTask) => {
    try {
      // If section admin, automatically associate with section
      if (isSectionAdmin && sectionId) {
        // Create the task with section ID attached
        const enhancedTask = {
          ...taskData
        };
        // Create task with section ID
        await onCreateTask(enhancedTask, sectionId);
      } else {
        await onCreateTask(taskData);
      }
      
      // After creating a task, refresh the task list to show the new task
      await refreshTasks();
      
      console.log('Task created and tasks refreshed');
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  // Enhanced deleteTeacher with better error handling and UI consistency
  const deleteTeacher = async (teacherId: string) => {
    if (!teacherId) {
      console.error('Invalid teacher ID provided for deletion');
      showErrorToast('Invalid teacher ID');
      return Promise.resolve(); // Still resolve to keep UI consistent
    }
    
    try {
      console.log('Attempting to delete teacher:', teacherId);
      await deleteTeacherService(teacherId);
      console.log('Teacher deleted successfully:', teacherId);
      return Promise.resolve();
    } catch (error: any) {
      // Log the error but still resolve the promise
      console.error('Failed to delete teacher:', teacherId, error);
      showErrorToast(`Error deleting teacher: ${error.message || 'Unknown error'}. The UI has been updated but you may need to refresh.`);
      
      // Return resolved promise anyway so UI stays consistent
      return Promise.resolve();
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <SideNavigation
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onLogout={onLogout}
        onCollapse={handleToggleSidebar}
        isSectionAdmin={isSectionAdmin}
      />
      
      <main className={`
        flex-1 overflow-y-auto w-full transition-all duration-300
        ${isMobileView ? 'pt-16' : isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}
      `}>
        <div className="max-w-full mx-auto p-3 sm:p-5 lg:p-6">
          <header className="mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  {activeTab === 'dashboard' && 'Dashboard'}
                  {activeTab === 'users' && 'User Management'}
                  {activeTab === 'tasks' && 'Task Management'}
                  {activeTab === 'announcements' && 'Announcements'}
                  {activeTab === 'teachers' && 'Teacher Management'}
                  {activeTab === 'courses' && 'Course Management'}
                  {activeTab === 'study-materials' && 'Study Materials'}
                  {activeTab === 'routine' && 'Routine Management'}
                </h1>
                {isSectionAdmin && sectionName && (
                  <p className="text-sm text-green-600 dark:text-green-400 font-medium mt-1">
                    Section Admin: {sectionName}
                  </p>
                )}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {new Date().toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </div>
            </div>
          </header>

          <div className="space-y-4 sm:space-y-6">
            {activeTab === 'dashboard' && (
              <Dashboard users={users} tasks={filteredTasks} />
            )}

            {activeTab === 'users' && (
              <div className="space-y-4 sm:space-y-6">
                <UserStats users={users} tasks={filteredTasks} />
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                  <div className="lg:col-span-2">
                    <UserActiveGraph users={users} />
                  </div>
                  <div>
                    <UserActivity users={users} />
                  </div>
                </div>
                
                <UserList users={users} onDeleteUser={handleDeleteUser} />
              </div>
            )}
            
            {activeTab === 'tasks' && (
              <TaskManager
                tasks={filteredTasks}
                onCreateTask={handleCreateTask}
                onDeleteTask={onDeleteTask}
                onUpdateTask={onUpdateTask}
                showTaskForm={showTaskForm}
              />
            )}

            {activeTab === 'announcements' && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 sm:p-5 overflow-hidden">
                <AnnouncementManager
                  announcements={filteredAnnouncements}
                  onCreateAnnouncement={createAnnouncement}
                  onDeleteAnnouncement={deleteAnnouncement}
                />
              </div>
            )}

            {activeTab === 'teachers' && (
              <TeacherManager
                teachers={teachers}
                courses={courses}
                onCreateTeacher={createTeacher as (teacher: NewTeacher, courseIds: string[]) => Promise<Teacher | undefined>}
                onUpdateTeacher={updateTeacher as (id: string, updates: Partial<Teacher>, courseIds: string[]) => Promise<Teacher | undefined>}
                onDeleteTeacher={deleteTeacher}
                onBulkImportTeachers={bulkImportTeachers}
                sectionId={sectionId}
                isSectionAdmin={isSectionAdmin}
              />
            )}

            {activeTab === 'courses' && (
              <CourseManager
                courses={courses}
                teachers={teachers}
                onCreateCourse={createCourse}
                onUpdateCourse={updateCourse}
                onDeleteCourse={deleteCourse}
                onBulkImportCourses={bulkImportCourses}
                sectionId={sectionId}
                isSectionAdmin={isSectionAdmin}
              />
            )}

            {activeTab === 'study-materials' && (
              <StudyMaterialManager
                courses={courses}
                materials={materials}
                onCreateMaterial={createMaterial}
                onDeleteMaterial={deleteMaterial}
              />
            )}

            {activeTab === 'routine' && (
              <RoutineManager
                routines={routines}
                courses={courses}
                teachers={teachers}
                onCreateRoutine={createRoutine}
                onUpdateRoutine={updateRoutine}
                onDeleteRoutine={deleteRoutine}
                onAddSlot={addRoutineSlot}
                onUpdateSlot={updateRoutineSlot}
                onDeleteSlot={deleteRoutineSlot}
                onActivateRoutine={activateRoutine}
                onDeactivateRoutine={deactivateRoutine}
                onBulkImportSlots={bulkImportSlots}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}